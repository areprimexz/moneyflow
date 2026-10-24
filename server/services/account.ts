import { eq } from "drizzle-orm";
import { ASSETS, getAsset, requireAsset } from "../../shared/assets";
import { D, Dec, ZERO, roundUsd, toDbString } from "../../shared/decimal";
import { consumeFifo } from "../../shared/engine/lots";
import { DomainError, unwrap } from "../../shared/engine/result";
import { priceAt, type ControlledMarketConfig } from "../../shared/market/controlled";
import type { AccountDTO, PositionDTO, TransactionDTO, WalletAccount } from "../../shared/types";
import { LIMITS, parseDecimalInput, parseUsdInput } from "../../shared/validation";
import { accounts, ledgerEntries, lotConsumptions, lots, orders, transactions } from "../db/schema";
import { ACCOUNT_ID, type Ctx, type DbOrTx } from "./context";
import { USD, assetDecimals, availableSpot, loadBalances, loadOpenLots, loadReservations, postTransaction } from "./ledger";
import { executeFill, getFees } from "./trading";

export const DEFAULT_INITIAL_BALANCE = "9999.00";
export const RESET_CONFIRMATION = "RESET";

function accountRow(db: DbOrTx) {
  return db.select().from(accounts).where(eq(accounts.id, ACCOUNT_ID)).get();
}

/** Create the paper account with its opening deposit if it does not exist yet. */
export function ensureAccount(ctx: Ctx, opts: { initialBalance?: string; startingState?: "cash" | "demo" } = {}): void {
  if (accountRow(ctx.db)) return;
  const now = ctx.now();
  const initial = unwrap(parseUsdInput(opts.initialBalance ?? DEFAULT_INITIAL_BALANCE, { label: "Initial balance", allowZero: true }));
  ctx.market.controlled(now); // materialise the market so seeded history is stable
  ctx.db.transaction((tx) => {
    tx.insert(accounts)
      .values({ id: ACCOUNT_ID, initialBalance: toDbString(initial), baselineAt: now, startingState: opts.startingState ?? "cash", revision: 0, createdAt: now, updatedAt: now })
      .run();
    openAccount(ctx, tx, { initialBalance: initial, baselineAt: now, startingState: opts.startingState ?? "cash", now });
  });
}

function openAccount(ctx: Ctx, tx: DbOrTx, opts: { initialBalance: Dec; baselineAt: number; startingState: "cash" | "demo"; now: number }): void {
  if (opts.initialBalance.gt(0)) {
    postTransaction(tx, {
      type: "deposit",
      asset: USD,
      gross: opts.initialBalance,
      fee: ZERO,
      net: opts.initialBalance,
      direction: "in",
      account: "spot",
      reason: "Opening balance",
      note: "Initial paper-trading balance",
      isFlow: true,
      flowValue: opts.initialBalance,
      createdAt: opts.baselineAt,
      entries: [{ account: "spot", asset: USD, amount: opts.initialBalance }],
    });
  }
  if (opts.startingState === "demo") seedDemoPortfolio(ctx, tx, opts.baselineAt, opts.now);
}

/**
 * Deterministic sample history: trades executed at the controlled market's historical
 * prices between the baseline date and now, posted through the normal ledger path.
 */
function seedDemoPortfolio(ctx: Ctx, tx: DbOrTx, baselineAt: number, now: number): void {
  const span = now - baselineAt;
  if (span < 60 * 60 * 1000) throw new DomainError("A demo portfolio needs a baseline date at least one hour in the past.", "baseline_too_recent");
  const cfg: ControlledMarketConfig = ctx.market.controlled(now);
  const fees = getFees(ctx);
  const taker = D(fees.takerRate);
  const at = (fraction: number) => Math.round(baselineAt + span * fraction);
  const spendPct = (symbol: string, pct: number, when: number) => {
    const asset = requireAsset(symbol);
    const balances = loadBalances(tx);
    const cash = balances.get("spot", USD);
    const price = priceAt(cfg, symbol, when);
    const qty = cash.times(pct).div(price.times(1 + Number(fees.takerRate))).toDecimalPlaces(asset.qtyDecimals, Dec.ROUND_DOWN);
    if (qty.lte(0) || roundUsd(qty.times(price)).lt(LIMITS.minOrderValue)) return;
    executeFill(tx, { symbol, side: "buy", quantity: qty, price, feeRate: taker, at: when, orderId: null });
  };
  const sellPct = (symbol: string, pct: number, when: number) => {
    const asset = requireAsset(symbol);
    const held = loadBalances(tx).get("spot", symbol);
    const qty = held.times(pct).toDecimalPlaces(asset.qtyDecimals, Dec.ROUND_DOWN);
    if (qty.lte(0)) return;
    const price = priceAt(cfg, symbol, when);
    if (roundUsd(qty.times(price)).lt(LIMITS.minOrderValue)) return;
    executeFill(tx, { symbol, side: "sell", quantity: qty, price, feeRate: taker, at: when, orderId: null });
  };
  spendPct("BTC", 0.32, at(0.03));
  spendPct("ETH", 0.3, at(0.06));
  spendPct("SOL", 0.22, at(0.1));
  spendPct("LINK", 0.15, at(0.18));
  spendPct("DOGE", 0.1, at(0.26));
  sellPct("SOL", 0.4, at(0.38));
  spendPct("BTC", 0.2, at(0.47));
  sellPct("DOGE", 0.5, at(0.55));
  spendPct("ADA", 0.15, at(0.64));
  spendPct("XRP", 0.12, at(0.72));
  sellPct("ETH", 0.25, at(0.81));
  spendPct("USDC", 0.25, at(0.86));
  // Move part of the BTC position to the Vault account.
  const btc = loadBalances(tx).get("spot", "BTC");
  const toVault = btc.times(0.35).toDecimalPlaces(requireAsset("BTC").qtyDecimals, Dec.ROUND_DOWN);
  if (toVault.gt(0)) postTransfer(ctx, tx, { asset: "BTC", amount: toVault, from: "spot", to: "vault", note: "Long-term holding", at: at(0.9) });
}

export function getAccount(ctx: Ctx): AccountDTO {
  const row = accountRow(ctx.db);
  if (!row) throw new DomainError("Account is not initialised.", "no_account", 500);
  const balances = loadBalances(ctx.db);
  const reservations = loadReservations(ctx.db);
  const txRows = ctx.db.select({ type: transactions.type, isFlow: transactions.isFlow, flowValue: transactions.flowValue, realizedPnl: transactions.realizedPnl, fee: transactions.fee, asset: transactions.asset, direction: transactions.direction }).from(transactions).all();
  let netContributions = ZERO;
  let realized = ZERO;
  let fees = ZERO;
  let trades = 0;
  const realizedBySymbol = new Map<string, Dec>();
  for (const t of txRows) {
    if (t.isFlow) netContributions = netContributions.plus(D(t.flowValue));
    if (t.realizedPnl) {
      realized = realized.plus(D(t.realizedPnl));
      realizedBySymbol.set(t.asset, (realizedBySymbol.get(t.asset) ?? ZERO).plus(D(t.realizedPnl)));
    }
    if (t.type === "buy" || t.type === "sell") {
      trades++;
      fees = fees.plus(D(t.fee));
    } else if (t.type === "withdrawal") fees = fees.plus(D(t.fee));
    else if (t.type === "fee_adjustment") fees = t.direction === "out" ? fees.plus(D(t.fee)) : fees.minus(D(t.fee));
  }
  const firstAcquired = new Map<string, number>();
  for (const l of ctx.db.select({ symbol: lots.symbol, openedAt: lots.openedAt }).from(lots).all()) {
    const prev = firstAcquired.get(l.symbol);
    if (prev === undefined || l.openedAt < prev) firstAcquired.set(l.symbol, l.openedAt);
  }
  const positions: PositionDTO[] = [];
  for (const asset of ASSETS) {
    const spot = balances.get("spot", asset.symbol);
    const vault = balances.get("vault", asset.symbol);
    const qty = spot.plus(vault);
    const realizedPnl = realizedBySymbol.get(asset.symbol) ?? ZERO;
    if (qty.isZero() && realizedPnl.isZero() && !firstAcquired.has(asset.symbol)) continue;
    const openLots = qty.gt(0) ? loadOpenLots(ctx.db, asset.symbol) : [];
    const reserved = reservations.assets.get(asset.symbol) ?? ZERO;
    positions.push({
      symbol: asset.symbol,
      quantity: toDbString(qty),
      spot: toDbString(spot),
      vault: toDbString(vault),
      reserved: toDbString(reserved),
      availableSpot: toDbString(spot.minus(reserved)),
      costBasis: toDbString(openLots.reduce((acc, l) => acc.plus(l.cost), ZERO)),
      realizedPnl: toDbString(realizedPnl),
      firstAcquiredAt: firstAcquired.get(asset.symbol) ?? null,
      openLots: openLots.length,
    });
  }
  const cashSpot = balances.get("spot", USD);
  const cashVault = balances.get("vault", USD);
  return {
    id: row.id,
    initialBalance: row.initialBalance,
    baselineAt: row.baselineAt,
    createdAt: row.createdAt,
    startingState: row.startingState,
    cash: {
      total: toDbString(cashSpot.plus(cashVault)),
      spot: toDbString(cashSpot),
      vault: toDbString(cashVault),
      reserved: toDbString(reservations.cash),
      availableSpot: toDbString(cashSpot.minus(reservations.cash)),
    },
    positions,
    totals: { netContributions: toDbString(netContributions), realizedPnl: toDbString(realized), feesPaid: toDbString(fees), tradeCount: trades, transactionCount: txRows.length },
    openOrders: ctx.db.select({ id: orders.id }).from(orders).where(eq(orders.status, "open")).all().length,
    revision: row.revision,
  };
}

export interface ResetInput {
  confirm: string;
  initialBalance?: string;
  baselineAt?: number;
  startingState?: "cash" | "demo";
  resetPreferences?: boolean;
  resetMarket?: boolean;
}

/** Restart the paper account. Requires the explicit confirmation phrase. */
export function resetAccount(ctx: Ctx, input: ResetInput): AccountDTO {
  if (input.confirm !== RESET_CONFIRMATION) throw new DomainError(`Type ${RESET_CONFIRMATION} to confirm the reset.`, "confirmation_required");
  const current = accountRow(ctx.db);
  const now = ctx.now();
  const initial = unwrap(parseUsdInput(input.initialBalance ?? current?.initialBalance ?? DEFAULT_INITIAL_BALANCE, { label: "Initial balance", allowZero: true }));
  const startingState = input.startingState ?? "cash";
  let baselineAt = input.baselineAt ?? now;
  if (!Number.isFinite(baselineAt)) throw new DomainError("Baseline date is invalid.", "invalid_baseline");
  if (baselineAt > now) throw new DomainError("Baseline date cannot be in the future.", "invalid_baseline");
  if (now - baselineAt > 5 * 365 * 86_400_000) throw new DomainError("Baseline date cannot be more than 5 years in the past.", "invalid_baseline");
  if (startingState === "demo" && input.baselineAt === undefined) baselineAt = now - 120 * 86_400_000;
  if (startingState === "demo" && now - baselineAt < 60 * 60 * 1000) throw new DomainError("A demo portfolio needs a baseline date at least one hour in the past.", "baseline_too_recent");
  if (input.resetMarket) ctx.market.resetControlled(now);
  if (input.resetPreferences) ctx.store.delete("preferences");
  ctx.db.transaction((tx) => {
    tx.delete(lotConsumptions).run();
    tx.delete(lots).run();
    tx.delete(ledgerEntries).run();
    tx.delete(transactions).run();
    tx.delete(orders).run();
    if (current) {
      tx.update(accounts)
        .set({ initialBalance: toDbString(initial), baselineAt, startingState, createdAt: now, updatedAt: now })
        .where(eq(accounts.id, ACCOUNT_ID))
        .run();
    } else {
      tx.insert(accounts).values({ id: ACCOUNT_ID, initialBalance: toDbString(initial), baselineAt, startingState, revision: 0, createdAt: now, updatedAt: now }).run();
    }
    openAccount(ctx, tx, { initialBalance: initial, baselineAt, startingState, now });
  });
  return getAccount(ctx);
}

function parseNote(note: string | null | undefined): string | null {
  const n = (note ?? "").trim();
  if (n.length > LIMITS.maxNoteLength) throw new DomainError(`Notes are limited to ${LIMITS.maxNoteLength} characters.`, "note_too_long");
  return n || null;
}

export interface AdjustmentInput {
  direction: "credit" | "debit";
  amount: string;
  reason: string;
  note?: string | null;
  kind?: "balance" | "fee";
  confirm: boolean;
}

/** Administrative cash adjustment on the Spot USD ledger. */
export function adjustBalance(ctx: Ctx, input: AdjustmentInput): TransactionDTO {
  if (input.confirm !== true) throw new DomainError("Adjustments must be confirmed.", "confirmation_required");
  if (input.direction !== "credit" && input.direction !== "debit") throw new DomainError("Direction must be credit or debit.", "invalid_direction");
  const amount = unwrap(parseUsdInput(input.amount, { label: "Amount" }));
  const reason = (input.reason ?? "").trim();
  if (!reason) throw new DomainError("A reason is required for every adjustment.", "reason_required");
  if (reason.length > 120) throw new DomainError("Reason is limited to 120 characters.", "reason_too_long");
  const note = parseNote(input.note);
  const kind = input.kind ?? "balance";
  return ctx.db.transaction((tx) => {
    const now = ctx.now();
    const signed = input.direction === "credit" ? amount : amount.neg();
    if (input.direction === "debit") {
      const available = availableSpot(loadBalances(tx), loadReservations(tx), USD);
      if (amount.gt(available)) throw new DomainError(`Debit exceeds available cash ($${roundUsd(available).toFixed(2)}). Funds reserved by open orders cannot be debited.`, "insufficient_funds");
    }
    return postTransaction(tx, {
      type: kind === "fee" ? "fee_adjustment" : "balance_adjustment",
      asset: USD,
      gross: amount,
      fee: kind === "fee" ? amount : ZERO,
      net: amount,
      direction: input.direction === "credit" ? "in" : "out",
      account: "spot",
      reason,
      note,
      isFlow: kind === "balance",
      flowValue: kind === "balance" ? signed : ZERO,
      createdAt: now,
      entries: [{ account: "spot", asset: USD, amount: signed }],
    });
  });
}

/** Set Spot cash to an exact target by posting the difference as an adjustment. */
export function setCashBalance(ctx: Ctx, input: { target: string; reason?: string; note?: string | null; confirm: boolean }): TransactionDTO {
  const target = unwrap(parseUsdInput(input.target, { label: "Cash balance", allowZero: true }));
  const current = loadBalances(ctx.db).get("spot", USD);
  const delta = target.minus(current);
  if (delta.isZero()) throw new DomainError("Cash balance already equals this amount.", "no_change");
  return adjustBalance(ctx, {
    direction: delta.isPositive() ? "credit" : "debit",
    amount: delta.abs().toFixed(2),
    reason: input.reason?.trim() || "Set cash balance",
    note: input.note,
    confirm: input.confirm,
  });
}

function checkAccount(v: unknown, label = "Account"): WalletAccount {
  if (v !== "spot" && v !== "vault") throw new DomainError(`${label} must be Spot or Vault.`, "invalid_account");
  return v;
}

function parseAssetAmount(asset: string, amount: string): Dec {
  const decimals = assetDecimals(asset);
  return unwrap(parseDecimalInput(amount, { label: "Amount", maxDecimals: decimals, max: asset === USD ? LIMITS.maxUsdAmount : new Dec("1e15") }));
}

function normalizeAsset(asset: string): string {
  const a = (asset ?? "").toUpperCase();
  if (a === USD) return USD;
  const meta = getAsset(a);
  if (!meta) throw new DomainError(`Unknown asset ${asset}.`, "unknown_asset");
  return meta.symbol;
}

/** Paper deposit: credits the internal ledger only. Nothing is received on-chain. */
export function deposit(ctx: Ctx, input: { asset: string; amount: string; account?: WalletAccount; note?: string | null }): TransactionDTO {
  const asset = normalizeAsset(input.asset);
  const account = checkAccount(input.account ?? "spot");
  const amount = parseAssetAmount(asset, input.amount);
  const note = parseNote(input.note);
  return ctx.db.transaction((tx) => {
    const now = ctx.now();
    if (asset === USD) {
      return postTransaction(tx, {
        type: "deposit",
        asset,
        gross: amount,
        fee: ZERO,
        net: amount,
        direction: "in",
        account,
        reason: "Paper deposit",
        note,
        isFlow: true,
        flowValue: amount,
        createdAt: now,
        entries: [{ account, asset, amount }],
      });
    }
    const price = ctx.market.valuationPrice(asset, now, now);
    if (!price) throw new DomainError("A current price is required to record the cost basis of a deposit.", "price_unavailable");
    const value = roundUsd(amount.times(price));
    return postTransaction(tx, {
      type: "deposit",
      asset,
      quantity: amount,
      unitPrice: price,
      gross: value,
      fee: ZERO,
      net: value,
      direction: "in",
      account,
      costBasis: value,
      reason: "Paper deposit",
      note,
      isFlow: true,
      flowValue: value,
      createdAt: now,
      entries: [{ account, asset, amount }],
      openLot: { symbol: asset, quantity: amount, cost: value },
    });
  });
}

/** Paper withdrawal: debits the internal ledger only. Nothing is sent on-chain. */
export function withdraw(ctx: Ctx, input: { asset: string; amount: string; account?: WalletAccount; note?: string | null }): TransactionDTO {
  const asset = normalizeAsset(input.asset);
  const account = checkAccount(input.account ?? "spot");
  const amount = parseAssetAmount(asset, input.amount);
  const note = parseNote(input.note);
  return ctx.db.transaction((tx) => {
    const now = ctx.now();
    const balances = loadBalances(tx);
    const reservations = loadReservations(tx);
    const available = account === "spot" ? availableSpot(balances, reservations, asset) : balances.get("vault", asset);
    if (asset === USD) {
      if (amount.gt(available)) throw new DomainError(`Amount exceeds the available ${account === "spot" ? "Spot" : "Vault"} cash balance.`, "insufficient_funds");
      return postTransaction(tx, {
        type: "withdrawal",
        asset,
        gross: amount,
        fee: ZERO,
        net: amount,
        direction: "out",
        account,
        reason: "Paper withdrawal",
        note,
        isFlow: true,
        flowValue: amount.neg(),
        createdAt: now,
        entries: [{ account, asset, amount: amount.neg() }],
      });
    }
    const meta = requireAsset(asset);
    const fee = D(meta.network.withdrawalFee);
    if (amount.lt(D(meta.network.minWithdrawal))) throw new DomainError(`Minimum withdrawal is ${meta.network.minWithdrawal} ${asset}.`, "below_minimum");
    const total = amount.plus(fee);
    if (total.gt(available)) throw new DomainError(`Amount plus the ${meta.network.withdrawalFee} ${asset} network fee exceeds the available balance.`, "insufficient_quantity");
    const price = ctx.market.valuationPrice(asset, now, now);
    if (!price) throw new DomainError("A current price is required to value this withdrawal.", "price_unavailable");
    const fifo = unwrap(consumeFifo(loadOpenLots(tx, asset), total));
    const gross = roundUsd(amount.times(price));
    const feeUsd = roundUsd(fee.times(price));
    return postTransaction(tx, {
      type: "withdrawal",
      asset,
      quantity: amount,
      unitPrice: price,
      gross,
      fee: feeUsd,
      net: gross.plus(feeUsd),
      direction: "out",
      account,
      costBasis: fifo.costRemoved,
      feeAsset: asset,
      feeQuantity: fee,
      reason: "Paper withdrawal",
      note,
      isFlow: true,
      flowValue: gross.neg(),
      createdAt: now,
      entries: [{ account, asset, amount: total.neg() }],
      consume: fifo.consumptions,
    });
  });
}

function postTransfer(ctx: Ctx, tx: DbOrTx, input: { asset: string; amount: Dec; from: WalletAccount; to: WalletAccount; note: string | null; at: number }): TransactionDTO {
  if (input.from === input.to) throw new DomainError("Choose two different accounts.", "same_account");
  const balances = loadBalances(tx);
  const reservations = loadReservations(tx);
  const available = input.from === "spot" ? availableSpot(balances, reservations, input.asset) : balances.get("vault", input.asset);
  if (input.amount.gt(available)) throw new DomainError("Amount exceeds the available balance in the source account.", "insufficient_funds");
  let value = input.amount;
  let unitPrice: Dec | null = null;
  if (input.asset !== USD) {
    unitPrice = ctx.market.valuationPrice(input.asset, input.at, ctx.now());
    value = unitPrice ? roundUsd(input.amount.times(unitPrice)) : ZERO;
  }
  return postTransaction(tx, {
    type: "transfer",
    asset: input.asset,
    quantity: input.asset === USD ? null : input.amount,
    unitPrice,
    gross: value,
    fee: ZERO,
    net: value,
    direction: "internal",
    account: input.from,
    counterAccount: input.to,
    reason: `Internal transfer ${input.from === "spot" ? "Spot → Vault" : "Vault → Spot"}`,
    note: input.note,
    isFlow: false,
    flowValue: ZERO,
    createdAt: input.at,
    entries: [
      { account: input.from, asset: input.asset, amount: input.amount.neg() },
      { account: input.to, asset: input.asset, amount: input.amount },
    ],
  });
}

/** Move funds between the Spot (trading) and Vault (holding) accounts of the paper ledger. */
export function transfer(ctx: Ctx, input: { asset: string; amount: string; from: WalletAccount; to: WalletAccount; note?: string | null }): TransactionDTO {
  const asset = normalizeAsset(input.asset);
  const from = checkAccount(input.from, "Source account");
  const to = checkAccount(input.to, "Destination account");
  const amount = parseAssetAmount(asset, input.amount);
  const note = parseNote(input.note);
  return ctx.db.transaction((tx) => postTransfer(ctx, tx, { asset, amount, from, to, note, at: ctx.now() }));
}
