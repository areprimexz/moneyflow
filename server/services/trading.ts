import { asc, desc, eq } from "drizzle-orm";
import { getAsset, requireAsset } from "../../shared/assets";
import { D, Dec, toDbString } from "../../shared/decimal";
import { MAX_FEE_RATE, type FeeSchedule, DEFAULT_FEES } from "../../shared/engine/fees";
import { consumeFifo } from "../../shared/engine/lots";
import {
  checkAffordability,
  isMarketable,
  limitBuyReservation,
  planTrade,
  validateLimitPrice,
  validateQuantity,
  type OrderSide,
  type OrderType,
} from "../../shared/engine/orders";
import { DomainError, unwrap } from "../../shared/engine/result";
import type { OrderDTO, TransactionDTO } from "../../shared/types";
import { orders } from "../db/schema";
import { newId } from "../ids";
import type { Ctx, DbOrTx } from "./context";
import { USD, availableSpot, loadBalances, loadOpenLots, loadReservations, postTransaction } from "./ledger";

const KEY_FEES = "fees";

export function getFees(ctx: Ctx): FeeSchedule {
  return ctx.store.get<FeeSchedule>(KEY_FEES) ?? DEFAULT_FEES;
}

export function setFees(ctx: Ctx, fees: FeeSchedule): FeeSchedule {
  for (const [label, v] of [
    ["Taker fee", fees.takerRate],
    ["Maker fee", fees.makerRate],
  ] as const) {
    const d = D(v);
    if (!d.isFinite() || d.isNegative() || d.gt(MAX_FEE_RATE)) throw new DomainError(`${label} must be between 0% and ${MAX_FEE_RATE.times(100).toFixed()}%.`, "invalid_fee");
  }
  const clean = { takerRate: toDbString(D(fees.takerRate)), makerRate: toDbString(D(fees.makerRate)) };
  ctx.store.set(KEY_FEES, clean, ctx.now());
  return clean;
}

type OrderRow = typeof orders.$inferSelect;

export function toOrderDTO(o: OrderRow): OrderDTO {
  return {
    id: o.id,
    clientOrderId: o.clientOrderId,
    symbol: o.symbol,
    side: o.side,
    type: o.type,
    quantity: o.quantity,
    limitPrice: o.limitPrice,
    status: o.status,
    feeRate: o.feeRate,
    reserved: o.reserved,
    filledPrice: o.filledPrice,
    filledAt: o.filledAt,
    transactionId: o.transactionId,
    liquidity: o.liquidity,
    cancelReason: o.cancelReason,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

export interface FillInput {
  symbol: string;
  side: OrderSide;
  quantity: Dec;
  price: Dec;
  feeRate: Dec;
  at: number;
  orderId: string | null;
  /** Order id whose own reservation may be used to fund this fill. */
  releaseOrderId?: string;
}

/**
 * Execute a fill against the ledger: validate funds, price the trade, move cash and
 * asset balances, open or consume FIFO lots and record the transaction. Atomic when
 * called inside a database transaction.
 */
export function executeFill(tx: DbOrTx, input: FillInput): TransactionDTO {
  const asset = requireAsset(input.symbol);
  const plan = unwrap(planTrade({ side: input.side, quantity: input.quantity, unitPrice: input.price, feeRate: input.feeRate, asset }));
  const balances = loadBalances(tx);
  const reservations = loadReservations(tx, input.releaseOrderId);
  unwrap(checkAffordability(plan, availableSpot(balances, reservations, USD), availableSpot(balances, reservations, asset.symbol)));

  if (plan.side === "buy") {
    return postTransaction(tx, {
      type: "buy",
      asset: asset.symbol,
      quantity: plan.quantity,
      unitPrice: plan.unitPrice,
      gross: plan.gross,
      fee: plan.fee,
      net: plan.net,
      direction: "in",
      account: "spot",
      orderId: input.orderId,
      costBasis: plan.net,
      isFlow: false,
      flowValue: D(0),
      createdAt: input.at,
      entries: [
        { account: "spot", asset: USD, amount: plan.net.neg() },
        { account: "spot", asset: asset.symbol, amount: plan.quantity },
      ],
      openLot: { symbol: asset.symbol, quantity: plan.quantity, cost: plan.net },
    });
  }
  const fifo = unwrap(consumeFifo(loadOpenLots(tx, asset.symbol), plan.quantity));
  return postTransaction(tx, {
    type: "sell",
    asset: asset.symbol,
    quantity: plan.quantity,
    unitPrice: plan.unitPrice,
    gross: plan.gross,
    fee: plan.fee,
    net: plan.net,
    direction: "out",
    account: "spot",
    orderId: input.orderId,
    costBasis: fifo.costRemoved,
    realizedPnl: plan.net.minus(fifo.costRemoved),
    isFlow: false,
    flowValue: D(0),
    createdAt: input.at,
    entries: [
      { account: "spot", asset: asset.symbol, amount: plan.quantity.neg() },
      { account: "spot", asset: USD, amount: plan.net },
    ],
    consume: fifo.consumptions,
  });
}

export interface PlaceOrderInput {
  clientOrderId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: string;
  limitPrice?: string | null;
}

export interface PlaceOrderResult {
  order: OrderDTO;
  transaction: TransactionDTO | null;
  duplicate: boolean;
}

export function placeOrder(ctx: Ctx, input: PlaceOrderInput): PlaceOrderResult {
  const asset = getAsset(input.symbol);
  if (!asset) throw new DomainError(`Unknown market ${input.symbol}/USD.`, "unknown_asset");
  if (input.side !== "buy" && input.side !== "sell") throw new DomainError("Order side must be buy or sell.", "invalid_side");
  if (input.type !== "market" && input.type !== "limit") throw new DomainError("Order type must be market or limit.", "invalid_type");
  if (!input.clientOrderId || input.clientOrderId.length > 64) throw new DomainError("A client order id is required.", "invalid_client_order_id");

  return ctx.db.transaction((tx) => {
    // Idempotency: a resubmitted order returns the original result and never executes twice.
    const existing = tx.select().from(orders).where(eq(orders.clientOrderId, input.clientOrderId)).get();
    if (existing) return { order: toOrderDTO(existing), transaction: null, duplicate: true };

    let quantity: Dec;
    try {
      quantity = D(input.quantity);
    } catch {
      throw new DomainError("Quantity must be a valid number.", "invalid_quantity");
    }
    unwrap(validateQuantity(quantity, asset));
    const now = ctx.now();
    const fees = getFees(ctx);
    const market = unwrap(ctx.market.executionPrice(asset.symbol, now));
    const orderId = newId("ORD", now);

    if (input.type === "limit") {
      let limitPrice: Dec;
      try {
        limitPrice = D(input.limitPrice ?? "");
      } catch {
        throw new DomainError("Limit price must be a valid number.", "invalid_price");
      }
      unwrap(validateLimitPrice(limitPrice, asset));
      if (!isMarketable(input.side, limitPrice, market.price)) {
        const makerRate = D(fees.makerRate);
        // Validate size and funds at the limit price, then reserve them.
        const plan = unwrap(planTrade({ side: input.side, quantity, unitPrice: limitPrice, feeRate: makerRate, asset }));
        const balances = loadBalances(tx);
        const reservations = loadReservations(tx);
        unwrap(checkAffordability(plan, availableSpot(balances, reservations, USD), availableSpot(balances, reservations, asset.symbol)));
        const reserved = input.side === "buy" ? limitBuyReservation(quantity, limitPrice, makerRate) : quantity;
        const row: OrderRow = {
          id: orderId,
          clientOrderId: input.clientOrderId,
          symbol: asset.symbol,
          side: input.side,
          type: "limit",
          quantity: toDbString(quantity),
          limitPrice: toDbString(limitPrice),
          status: "open",
          feeRate: toDbString(makerRate),
          reserved: toDbString(reserved),
          filledPrice: null,
          filledAt: null,
          transactionId: null,
          liquidity: null,
          cancelReason: null,
          lastCheckedAt: now,
          createdAt: now,
          updatedAt: now,
        };
        tx.insert(orders).values(row).run();
        return { order: toOrderDTO(row), transaction: null, duplicate: false };
      }
      // Marketable limit: executes immediately at the current price (never worse than the limit).
      const takerRate = D(fees.takerRate);
      const transaction = executeFill(tx, { symbol: asset.symbol, side: input.side, quantity, price: market.price, feeRate: takerRate, at: now, orderId });
      const row: OrderRow = {
        id: orderId,
        clientOrderId: input.clientOrderId,
        symbol: asset.symbol,
        side: input.side,
        type: "limit",
        quantity: toDbString(quantity),
        limitPrice: toDbString(limitPrice),
        status: "filled",
        feeRate: toDbString(takerRate),
        reserved: "0",
        filledPrice: transaction.unitPrice,
        filledAt: now,
        transactionId: transaction.id,
        liquidity: "taker",
        cancelReason: null,
        lastCheckedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      tx.insert(orders).values(row).run();
      return { order: toOrderDTO(row), transaction, duplicate: false };
    }

    const takerRate = D(fees.takerRate);
    const transaction = executeFill(tx, { symbol: asset.symbol, side: input.side, quantity, price: market.price, feeRate: takerRate, at: now, orderId });
    const row: OrderRow = {
      id: orderId,
      clientOrderId: input.clientOrderId,
      symbol: asset.symbol,
      side: input.side,
      type: "market",
      quantity: toDbString(quantity),
      limitPrice: null,
      status: "filled",
      feeRate: toDbString(takerRate),
      reserved: "0",
      filledPrice: transaction.unitPrice,
      filledAt: now,
      transactionId: transaction.id,
      liquidity: "taker",
      cancelReason: null,
      lastCheckedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    tx.insert(orders).values(row).run();
    return { order: toOrderDTO(row), transaction, duplicate: false };
  });
}

export function cancelOrder(ctx: Ctx, id: string, reason = "Cancelled by user"): OrderDTO {
  return ctx.db.transaction((tx) => {
    const o = tx.select().from(orders).where(eq(orders.id, id)).get();
    if (!o) throw new DomainError("Order not found.", "not_found", 404);
    if (o.status !== "open") throw new DomainError(`Only open orders can be cancelled (this order is ${o.status}).`, "order_not_open", 409);
    const now = ctx.now();
    tx.update(orders).set({ status: "cancelled", cancelReason: reason, reserved: "0", updatedAt: now }).where(eq(orders.id, id)).run();
    return toOrderDTO({ ...o, status: "cancelled", cancelReason: reason, reserved: "0", updatedAt: now });
  });
}

export function cancelAllOrders(ctx: Ctx): number {
  const open = ctx.db.select().from(orders).where(eq(orders.status, "open")).all();
  for (const o of open) cancelOrder(ctx, o.id);
  return open.length;
}

/**
 * Fill resting limit orders whose price condition was met since they were last checked.
 * Fills execute at the limit price with the maker fee, at the time the condition was met.
 */
export function matchOpenOrders(ctx: Ctx): { filled: OrderDTO[] } {
  const now = ctx.now();
  const open = ctx.db.select().from(orders).where(eq(orders.status, "open")).orderBy(asc(orders.createdAt)).all();
  const filled: OrderDTO[] = [];
  for (const o of open) {
    const limit = D(o.limitPrice ?? "0");
    const match = ctx.market.findMatch(o.symbol, o.lastCheckedAt, now, (price) => isMarketable(o.side, limit, price));
    ctx.db.transaction((tx) => {
      const current = tx.select().from(orders).where(eq(orders.id, o.id)).get();
      if (!current || current.status !== "open") return; // cancelled or filled concurrently
      if (!match) {
        tx.update(orders).set({ lastCheckedAt: now }).where(eq(orders.id, o.id)).run();
        return;
      }
      try {
        const transaction = executeFill(tx, {
          symbol: o.symbol,
          side: o.side,
          quantity: D(o.quantity),
          price: limit,
          feeRate: D(o.feeRate),
          at: match.time,
          orderId: o.id,
          releaseOrderId: o.id,
        });
        tx.update(orders)
          .set({ status: "filled", reserved: "0", filledPrice: transaction.unitPrice, filledAt: match.time, transactionId: transaction.id, liquidity: "maker", lastCheckedAt: now, updatedAt: now })
          .where(eq(orders.id, o.id))
          .run();
        filled.push(toOrderDTO({ ...current, status: "filled", reserved: "0", filledPrice: transaction.unitPrice, filledAt: match.time, transactionId: transaction.id, liquidity: "maker", lastCheckedAt: now, updatedAt: now }));
      } catch (e) {
        if (!(e instanceof DomainError)) throw e;
        // Funds are reserved at placement, so this only happens if the ledger was altered externally.
        tx.update(orders)
          .set({ status: "rejected", reserved: "0", cancelReason: `Rejected at fill: ${e.message}`, lastCheckedAt: now, updatedAt: now })
          .where(eq(orders.id, o.id))
          .run();
      }
    });
  }
  return { filled };
}

export function listOrders(ctx: Ctx, limit = 500): OrderDTO[] {
  return ctx.db.select().from(orders).orderBy(desc(orders.createdAt)).limit(limit).all().map(toOrderDTO);
}
