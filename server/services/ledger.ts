import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { requireAsset } from "../../shared/assets";
import { D, Dec, ZERO, toDbString } from "../../shared/decimal";
import type { LotConsumption, OpenLot } from "../../shared/engine/lots";
import { DomainError } from "../../shared/engine/result";
import type { LedgerEntryDTO, TransactionDTO, TransactionType, WalletAccount } from "../../shared/types";
import { accounts, ledgerEntries, lotConsumptions, lots, orders, transactions } from "../db/schema";
import { newId } from "../ids";
import { ACCOUNT_ID, type DbOrTx } from "./context";

export const USD = "USD";

export interface Balances {
  get(account: WalletAccount, asset: string): Dec;
  total(asset: string): Dec;
  assets(): string[];
}

/** Sum every ledger entry with decimal arithmetic. This is the only source of balances. */
export function loadBalances(db: DbOrTx): Balances {
  const rows = db.select({ account: ledgerEntries.account, asset: ledgerEntries.asset, amount: ledgerEntries.amount }).from(ledgerEntries).all();
  const map = new Map<string, Dec>();
  for (const r of rows) {
    const key = `${r.account}:${r.asset}`;
    map.set(key, (map.get(key) ?? ZERO).plus(D(r.amount)));
  }
  return {
    get: (account, asset) => map.get(`${account}:${asset}`) ?? ZERO,
    total: (asset) => (map.get(`spot:${asset}`) ?? ZERO).plus(map.get(`vault:${asset}`) ?? ZERO),
    assets: () => [...new Set([...map.keys()].map((k) => k.split(":")[1]!))],
  };
}

export interface Reservations {
  cash: Dec;
  assets: Map<string, Dec>;
}

/** Funds locked by open limit orders (Spot account only). */
export function loadReservations(db: DbOrTx, excludeOrderId?: string): Reservations {
  const open = db.select().from(orders).where(eq(orders.status, "open")).all();
  let cash = ZERO;
  const assets = new Map<string, Dec>();
  for (const o of open) {
    if (o.id === excludeOrderId) continue;
    if (o.side === "buy") cash = cash.plus(D(o.reserved));
    else assets.set(o.symbol, (assets.get(o.symbol) ?? ZERO).plus(D(o.reserved)));
  }
  return { cash, assets };
}

export function availableSpot(balances: Balances, reservations: Reservations, asset: string): Dec {
  const reserved = asset === USD ? reservations.cash : (reservations.assets.get(asset) ?? ZERO);
  return balances.get("spot", asset).minus(reserved);
}

/** Open FIFO lots for a symbol: original lot minus all consumptions. */
export function loadOpenLots(db: DbOrTx, symbol: string): OpenLot[] {
  const lotRows = db.select().from(lots).where(eq(lots.symbol, symbol)).orderBy(asc(lots.openedAt), asc(lots.id)).all();
  if (lotRows.length === 0) return [];
  const consumed = db
    .select()
    .from(lotConsumptions)
    .where(
      inArray(
        lotConsumptions.lotId,
        lotRows.map((l) => l.id),
      ),
    )
    .all();
  const usedQty = new Map<string, Dec>();
  const usedCost = new Map<string, Dec>();
  for (const c of consumed) {
    usedQty.set(c.lotId, (usedQty.get(c.lotId) ?? ZERO).plus(D(c.quantity)));
    usedCost.set(c.lotId, (usedCost.get(c.lotId) ?? ZERO).plus(D(c.cost)));
  }
  return lotRows
    .map((l) => ({ id: l.id, openedAt: l.openedAt, quantity: D(l.quantity).minus(usedQty.get(l.id) ?? ZERO), cost: D(l.cost).minus(usedCost.get(l.id) ?? ZERO) }))
    .filter((l) => l.quantity.gt(0));
}

export interface EntryInput {
  account: WalletAccount;
  asset: string;
  amount: Dec;
}

export interface PostTransactionInput {
  type: TransactionType;
  asset: string;
  quantity?: Dec | null;
  unitPrice?: Dec | null;
  gross: Dec;
  fee: Dec;
  net: Dec;
  direction: "in" | "out" | "internal";
  account: WalletAccount;
  counterAccount?: WalletAccount | null;
  orderId?: string | null;
  realizedPnl?: Dec | null;
  costBasis?: Dec | null;
  feeAsset?: string;
  feeQuantity?: Dec | null;
  reason?: string | null;
  note?: string | null;
  isFlow: boolean;
  flowValue: Dec;
  createdAt: number;
  entries: EntryInput[];
  openLot?: { symbol: string; quantity: Dec; cost: Dec };
  consume?: LotConsumption[];
}

/**
 * Post a transaction and its ledger entries. Must run inside a database transaction;
 * afterwards every touched balance is verified to be non-negative, otherwise the whole
 * transaction is rolled back by throwing.
 */
export function postTransaction(tx: DbOrTx, input: PostTransactionInput): TransactionDTO {
  const id = newId("TX", input.createdAt);
  const seqRow = tx.select({ max: sql<number>`coalesce(max(${transactions.seq}), 0)` }).from(transactions).get();
  const seq = (seqRow?.max ?? 0) + 1;
  const row = {
    id,
    seq,
    type: input.type,
    status: "settled" as const,
    asset: input.asset,
    quantity: input.quantity ? toDbString(input.quantity) : null,
    unitPrice: input.unitPrice ? toDbString(input.unitPrice) : null,
    gross: toDbString(input.gross),
    fee: toDbString(input.fee),
    net: toDbString(input.net),
    direction: input.direction,
    account: input.account,
    counterAccount: input.counterAccount ?? null,
    orderId: input.orderId ?? null,
    realizedPnl: input.realizedPnl ? toDbString(input.realizedPnl) : null,
    costBasis: input.costBasis ? toDbString(input.costBasis) : null,
    feeAsset: input.feeAsset ?? USD,
    feeQuantity: input.feeQuantity ? toDbString(input.feeQuantity) : null,
    reason: input.reason ?? null,
    note: input.note ?? null,
    isFlow: input.isFlow,
    flowValue: toDbString(input.flowValue),
    createdAt: input.createdAt,
  };
  tx.insert(transactions).values(row).run();
  const entries = input.entries.filter((e) => !e.amount.isZero());
  for (const e of entries) {
    tx.insert(ledgerEntries)
      .values({ id: newId("LE", input.createdAt), transactionId: id, account: e.account, asset: e.asset, amount: toDbString(e.amount), createdAt: input.createdAt })
      .run();
  }
  if (input.openLot) {
    tx.insert(lots)
      .values({ id: newId("LOT", input.createdAt), symbol: input.openLot.symbol, transactionId: id, openedAt: input.createdAt, quantity: toDbString(input.openLot.quantity), cost: toDbString(input.openLot.cost) })
      .run();
  }
  for (const c of input.consume ?? []) {
    tx.insert(lotConsumptions)
      .values({ id: newId("LC", input.createdAt), lotId: c.lotId, transactionId: id, quantity: toDbString(c.quantity), cost: toDbString(c.cost), createdAt: input.createdAt })
      .run();
  }
  // Safety net: no movement may leave a negative balance.
  const balances = loadBalances(tx);
  for (const e of entries) {
    const bal = balances.get(e.account, e.asset);
    if (bal.isNegative()) {
      throw new DomainError(`This transaction would leave a negative ${e.asset} balance in ${e.account === "spot" ? "Spot" : "Vault"}.`, "negative_balance", 409);
    }
  }
  bumpRevision(tx, input.createdAt);
  return toTransactionDTO(row);
}

export function bumpRevision(tx: DbOrTx, now: number): void {
  tx.update(accounts)
    .set({ revision: sql`${accounts.revision} + 1`, updatedAt: now })
    .where(eq(accounts.id, ACCOUNT_ID))
    .run();
}

type TxRow = typeof transactions.$inferSelect;

export function toTransactionDTO(r: Omit<TxRow, "isFlow" | "flowValue"> & Partial<Pick<TxRow, "isFlow" | "flowValue">>, ledger?: LedgerEntryDTO[]): TransactionDTO {
  return {
    id: r.id,
    seq: r.seq,
    type: r.type,
    status: r.status,
    asset: r.asset,
    quantity: r.quantity,
    unitPrice: r.unitPrice,
    gross: r.gross,
    fee: r.fee,
    net: r.net,
    direction: r.direction,
    account: r.account,
    counterAccount: r.counterAccount,
    orderId: r.orderId,
    realizedPnl: r.realizedPnl,
    costBasis: r.costBasis,
    feeAsset: r.feeAsset,
    feeQuantity: r.feeQuantity,
    reason: r.reason,
    note: r.note,
    createdAt: r.createdAt,
    ...(ledger ? { ledger } : {}),
  };
}

export function listTransactions(db: DbOrTx, limit = 5000): TransactionDTO[] {
  return db
    .select()
    .from(transactions)
    .orderBy(desc(transactions.createdAt), desc(transactions.seq))
    .limit(limit)
    .all()
    .map((r) => toTransactionDTO(r));
}

export function getTransaction(db: DbOrTx, id: string): TransactionDTO | null {
  const r = db.select().from(transactions).where(eq(transactions.id, id)).get();
  if (!r) return null;
  const ledger = db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.transactionId, id))
    .all()
    .map((e) => ({ id: e.id, transactionId: e.transactionId, account: e.account, asset: e.asset, amount: e.amount, createdAt: e.createdAt }));
  return toTransactionDTO(r, ledger);
}

export function assetDecimals(asset: string): number {
  return asset === USD ? 2 : requireAsset(asset).qtyDecimals;
}
