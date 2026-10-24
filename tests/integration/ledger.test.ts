import { afterEach, describe, expect, it } from "vitest";
import { D, sum } from "../../shared/decimal";
import { valuePortfolio } from "../../shared/engine/portfolio";
import { DomainError } from "../../shared/engine/result";
import { HOUR_MS, MINUTE_MS } from "../../shared/market/controlled";
import { formatUsd } from "../../shared/format";
import { createFlux } from "../../server/flux";
import { adjustBalance, deposit, getAccount, resetAccount, setCashBalance, transfer, withdraw } from "../../server/services/account";
import { getTransaction, listTransactions } from "../../server/services/ledger";
import { analytics, portfolioHistory } from "../../server/services/portfolio";
import { updateMarketAsset } from "../../server/services/settings";
import { cancelOrder, listOrders, matchOpenOrders, placeOrder } from "../../server/services/trading";
import { FakeClock, cid, makeFlux, tempDbPath } from "../helpers";

let flux: ReturnType<typeof makeFlux> | null = null;
afterEach(() => {
  flux?.close();
  flux = null;
});

function setup(initialBalance?: string) {
  flux = makeFlux({ initialBalance });
  return flux;
}

function value(f: ReturnType<typeof makeFlux>) {
  return valuePortfolio(getAccount(f.ctx), f.ctx.market.quotes(f.clock.t).quotes);
}

function expectDomainError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(DomainError);
    expect((e as DomainError).code).toBe(code);
    return;
  }
  throw new Error(`Expected DomainError ${code}`);
}

describe("account initialisation and balances", () => {
  it("starts a brand-new account at $0.00 with no transactions by default", () => {
    const clock = new FakeClock();
    flux = Object.assign(createFlux({ dbPath: ":memory:", now: clock.now, provider: null }), { clock });
    const a = getAccount(flux.ctx);
    expect(a.initialBalance).toBe("0");
    expect(a.cash.total).toBe("0");
    expect(formatUsd(value(flux).totalValue)).toBe("$0.00");
    expect(listTransactions(flux.ctx.db)).toHaveLength(0);
    // Funds can then be added through the ledger.
    deposit(flux.ctx, { asset: "USD", amount: "500" });
    expect(formatUsd(value(flux).totalValue)).toBe("$500.00");
  });

  it("rejects a sample portfolio without a starting balance", () => {
    const f = setup();
    expectDomainError(() => resetAccount(f.ctx, { confirm: "RESET", startingState: "demo", initialBalance: "0" }), "invalid_initial_balance");
    expect(getAccount(f.ctx).cash.total).toBe("9999");
  });

  it("initialises a new portfolio with $9,999.00 USD", () => {
    const f = setup();
    const a = getAccount(f.ctx);
    expect(a.cash.total).toBe("9999");
    expect(formatUsd(value(f).totalValue)).toBe("$9,999.00");
    const txs = listTransactions(f.ctx.db);
    expect(txs).toHaveLength(1);
    expect(txs[0]!.type).toBe("deposit");
    expect(txs[0]!.reason).toBe("Opening balance");
  });

  it("changes the starting amount from settings (account restart)", () => {
    const f = setup();
    const a = resetAccount(f.ctx, { confirm: "RESET", initialBalance: "1000000" });
    expect(a.initialBalance).toBe("1000000");
    expect(formatUsd(value(f).totalValue)).toBe("$1,000,000.00");
    expect(listTransactions(f.ctx.db)).toHaveLength(1);
  });

  it("requires explicit confirmation to reset", () => {
    const f = setup();
    placeOrder(f.ctx, { clientOrderId: cid(), symbol: "ETH", side: "buy", type: "market", quantity: "0.5" });
    expectDomainError(() => resetAccount(f.ctx, { confirm: "yes" }), "confirmation_required");
    expect(getAccount(f.ctx).positions).toHaveLength(1);
  });

  it("adding cash updates the total portfolio value", () => {
    const f = setup();
    const before = value(f).totalValue;
    adjustBalance(f.ctx, { direction: "credit", amount: "500.25", reason: "Top up", confirm: true });
    expect(value(f).totalValue.minus(before).toFixed()).toBe("500.25");
    deposit(f.ctx, { asset: "USD", amount: "100" });
    expect(value(f).totalValue.minus(before).toFixed()).toBe("600.25");
    expect(getAccount(f.ctx).totals.netContributions).toBe("10599.25");
  });

  it("sets the cash balance through an explicit ledger adjustment", () => {
    const f = setup();
    const tx = setCashBalance(f.ctx, { target: "25000", confirm: true });
    expect(tx.type).toBe("balance_adjustment");
    expect(tx.gross).toBe("15001");
    expect(getAccount(f.ctx).cash.spot).toBe("25000");
    setCashBalance(f.ctx, { target: "100", confirm: true });
    expect(getAccount(f.ctx).cash.spot).toBe("100");
  });

  it("rejects unconfirmed, invalid and overdrawing adjustments", () => {
    const f = setup();
    expectDomainError(() => adjustBalance(f.ctx, { direction: "credit", amount: "10", reason: "x", confirm: false }), "confirmation_required");
    expectDomainError(() => adjustBalance(f.ctx, { direction: "credit", amount: "-10", reason: "x", confirm: true }), "invalid_request");
    expectDomainError(() => adjustBalance(f.ctx, { direction: "credit", amount: "abc", reason: "x", confirm: true }), "invalid_request");
    expectDomainError(() => adjustBalance(f.ctx, { direction: "credit", amount: "10", reason: "  ", confirm: true }), "reason_required");
    expectDomainError(() => adjustBalance(f.ctx, { direction: "debit", amount: "10000", reason: "x", confirm: true }), "insufficient_funds");
    expect(getAccount(f.ctx).cash.total).toBe("9999");
  });
});

describe("market orders", () => {
  it("a market buy decreases cash and adds the exact quantity", () => {
    const f = setup();
    const price = D(f.ctx.market.quotes(f.clock.t).quotes.find((q) => q.symbol === "BTC")!.price);
    const { transaction } = placeOrder(f.ctx, { clientOrderId: cid(), symbol: "BTC", side: "buy", type: "market", quantity: "0.05" });
    const gross = price.times("0.05").toDecimalPlaces(2);
    const fee = gross.times("0.001").toDecimalPlaces(2);
    expect(transaction!.unitPrice).toBe(price.toFixed());
    expect(transaction!.gross).toBe(gross.toFixed());
    expect(transaction!.fee).toBe(fee.toFixed());
    const a = getAccount(f.ctx);
    expect(a.cash.spot).toBe(D("9999").minus(gross).minus(fee).toFixed());
    expect(a.positions[0]).toMatchObject({ symbol: "BTC", quantity: "0.05", costBasis: gross.plus(fee).toFixed() });
  });

  it("a market sell increases cash and reduces quantity", () => {
    const f = setup();
    placeOrder(f.ctx, { clientOrderId: cid(), symbol: "ETH", side: "buy", type: "market", quantity: "1" });
    const cashBefore = D(getAccount(f.ctx).cash.spot);
    const { transaction } = placeOrder(f.ctx, { clientOrderId: cid(), symbol: "ETH", side: "sell", type: "market", quantity: "0.4" });
    const a = getAccount(f.ctx);
    expect(D(a.cash.spot).minus(cashBefore).toFixed()).toBe(D(transaction!.gross).minus(transaction!.fee).toFixed());
    expect(a.positions.find((p) => p.symbol === "ETH")!.quantity).toBe("0.6");
  });

  it("applies fees consistently on every trade", () => {
    const f = setup();
    for (const [side, qty] of [
      ["buy", "10"],
      ["sell", "3"],
      ["buy", "1.5"],
    ] as const) {
      const { transaction } = placeOrder(f.ctx, { clientOrderId: cid(), symbol: "SOL", side, type: "market", quantity: qty });
      expect(transaction!.fee).toBe(D(transaction!.gross).times("0.001").toDecimalPlaces(2).toFixed());
      expect(transaction!.net).toBe((side === "buy" ? D(transaction!.gross).plus(transaction!.fee) : D(transaction!.gross).minus(transaction!.fee)).toFixed());
    }
    const fees = sum(listTransactions(f.ctx.db).map((t) => t.fee));
    expect(getAccount(f.ctx).totals.feesPaid).toBe(fees.toFixed());
  });

  it("rejects overspending without changing the ledger", () => {
    const f = setup();
    expectDomainError(() => placeOrder(f.ctx, { clientOrderId: cid(), symbol: "BTC", side: "buy", type: "market", quantity: "1" }), "insufficient_funds");
    expect(getAccount(f.ctx).cash.spot).toBe("9999");
    expect(listOrders(f.ctx)).toHaveLength(0);
  });

  it("rejects selling more than is owned or assets that are not owned", () => {
    const f = setup();
    expectDomainError(() => placeOrder(f.ctx, { clientOrderId: cid(), symbol: "DOGE", side: "sell", type: "market", quantity: "100" }), "insufficient_quantity");
    placeOrder(f.ctx, { clientOrderId: cid(), symbol: "DOGE", side: "buy", type: "market", quantity: "100" });
    expectDomainError(() => placeOrder(f.ctx, { clientOrderId: cid(), symbol: "DOGE", side: "sell", type: "market", quantity: "101" }), "insufficient_quantity");
    expect(getAccount(f.ctx).positions[0]!.quantity).toBe("100");
  });

  it("rejects invalid numbers", () => {
    const f = setup();
    for (const quantity of ["abc", "-1", "0", "NaN", "Infinity", "0.0000001"]) {
      expect(() => placeOrder(f.ctx, { clientOrderId: cid(), symbol: "BTC", side: "buy", type: "market", quantity })).toThrow(DomainError);
    }
    expect(() => placeOrder(f.ctx, { clientOrderId: cid(), symbol: "BTC", side: "buy", type: "limit", quantity: "0.01", limitPrice: "-5" })).toThrow(DomainError);
    expect(() => placeOrder(f.ctx, { clientOrderId: cid(), symbol: "NOPE", side: "buy", type: "market", quantity: "1" })).toThrow(DomainError);
    expect(listTransactions(f.ctx.db)).toHaveLength(1);
  });

  it("never executes the same order twice", () => {
    const f = setup();
    const id = cid();
    const first = placeOrder(f.ctx, { clientOrderId: id, symbol: "BTC", side: "buy", type: "market", quantity: "0.01" });
    const second = placeOrder(f.ctx, { clientOrderId: id, symbol: "BTC", side: "buy", type: "market", quantity: "0.01" });
    expect(second.duplicate).toBe(true);
    expect(second.order.id).toBe(first.order.id);
    expect(getAccount(f.ctx).positions[0]!.quantity).toBe("0.01");
    expect(listTransactions(f.ctx.db).filter((t) => t.type === "buy")).toHaveLength(1);
    expectDomainError(() => cancelOrder(f.ctx, first.order.id), "order_not_open");
  });

  it("halts trading on disabled markets", () => {
    const f = setup();
    updateMarketAsset(f.ctx, "XRP", { enabled: false });
    expectDomainError(() => placeOrder(f.ctx, { clientOrderId: cid(), symbol: "XRP", side: "buy", type: "market", quantity: "10" }), "market_halted");
  });
});

describe("limit orders", () => {
  it("remain pending until the price condition is met, then fill once at the limit", () => {
    const f = setup();
    const price = D(f.ctx.market.quotes(f.clock.t).quotes.find((q) => q.symbol === "ETH")!.price);
    const limit = price.times("0.9").toDecimalPlaces(2);
    const { order } = placeOrder(f.ctx, { clientOrderId: cid(), symbol: "ETH", side: "buy", type: "limit", quantity: "1", limitPrice: limit.toFixed() });
    expect(order.status).toBe("open");
    const a = getAccount(f.ctx);
    expect(a.cash.spot).toBe("9999");
    expect(a.cash.reserved).toBe(order.reserved);
    expect(D(a.cash.availableSpot).toFixed()).toBe(D("9999").minus(order.reserved).toFixed());

    f.clock.advance(MINUTE_MS);
    matchOpenOrders(f.ctx);
    expect(listOrders(f.ctx)[0]!.status).toBe("open");

    // Operator moves the market below the limit.
    f.clock.advance(MINUTE_MS);
    updateMarketAsset(f.ctx, "ETH", { price: limit.times("0.97").toDecimalPlaces(2).toFixed(), change24h: "-12" });
    f.clock.advance(10_000);
    const { filled } = matchOpenOrders(f.ctx);
    expect(filled).toHaveLength(1);
    const o = listOrders(f.ctx)[0]!;
    expect(o.status).toBe("filled");
    expect(o.liquidity).toBe("maker");
    expect(o.filledPrice).toBe(limit.toFixed());
    const tx = getTransaction(f.ctx.db, o.transactionId!)!;
    expect(tx.fee).toBe(D(tx.gross).times("0.0008").toDecimalPlaces(2).toFixed());
    const after = getAccount(f.ctx);
    expect(after.cash.reserved).toBe("0");
    expect(after.cash.spot).toBe(D("9999").minus(tx.net).toFixed());

    // A second matching pass does nothing.
    f.clock.advance(HOUR_MS);
    expect(matchOpenOrders(f.ctx).filled).toHaveLength(0);
    expect(listTransactions(f.ctx.db).filter((t) => t.type === "buy")).toHaveLength(1);
  });

  it("cancelled orders release funds and never execute", () => {
    const f = setup();
    const price = D(f.ctx.market.quotes(f.clock.t).quotes.find((q) => q.symbol === "BTC")!.price);
    const limit = price.times("0.95").toDecimalPlaces(2);
    const { order } = placeOrder(f.ctx, { clientOrderId: cid(), symbol: "BTC", side: "buy", type: "limit", quantity: "0.05", limitPrice: limit.toFixed() });
    cancelOrder(f.ctx, order.id);
    expect(getAccount(f.ctx).cash.reserved).toBe("0");
    f.clock.advance(MINUTE_MS);
    updateMarketAsset(f.ctx, "BTC", { price: limit.times("0.9").toDecimalPlaces(2).toFixed() });
    f.clock.advance(MINUTE_MS);
    matchOpenOrders(f.ctx);
    expect(listOrders(f.ctx)[0]!.status).toBe("cancelled");
    expect(getAccount(f.ctx).positions).toHaveLength(0);
    expectDomainError(() => cancelOrder(f.ctx, order.id), "order_not_open");
  });

  it("reserves assets for sell limits and blocks double-spending them", () => {
    const f = setup();
    placeOrder(f.ctx, { clientOrderId: cid(), symbol: "SOL", side: "buy", type: "market", quantity: "10" });
    const price = D(f.ctx.market.quotes(f.clock.t).quotes.find((q) => q.symbol === "SOL")!.price);
    placeOrder(f.ctx, { clientOrderId: cid(), symbol: "SOL", side: "sell", type: "limit", quantity: "8", limitPrice: price.times("1.2").toDecimalPlaces(2).toFixed() });
    expectDomainError(() => placeOrder(f.ctx, { clientOrderId: cid(), symbol: "SOL", side: "sell", type: "market", quantity: "3" }), "insufficient_quantity");
    expect(getAccount(f.ctx).positions[0]!.availableSpot).toBe("2");
  });

  it("executes a marketable limit order immediately at the market price", () => {
    const f = setup();
    const price = D(f.ctx.market.quotes(f.clock.t).quotes.find((q) => q.symbol === "LINK")!.price);
    const { order, transaction } = placeOrder(f.ctx, { clientOrderId: cid(), symbol: "LINK", side: "buy", type: "limit", quantity: "10", limitPrice: price.times("1.05").toDecimalPlaces(3).toFixed() });
    expect(order.status).toBe("filled");
    expect(order.liquidity).toBe("taker");
    expect(transaction!.unitPrice).toBe(price.toFixed());
  });
});

describe("valuation and P/L", () => {
  it("revalues the portfolio when market prices change", () => {
    const f = setup();
    placeOrder(f.ctx, { clientOrderId: cid(), symbol: "ETH", side: "buy", type: "market", quantity: "1" });
    const before = value(f);
    f.clock.advance(MINUTE_MS);
    updateMarketAsset(f.ctx, "ETH", { price: "5000", change24h: "10" });
    const after = value(f);
    expect(after.positions[0]!.price!.toFixed()).toBe("5000");
    expect(after.totalValue.toFixed()).toBe(after.cash.plus(5000).toFixed());
    expect(after.totalValue.gt(before.totalValue)).toBe(true);
  });

  it("computes realized and unrealized P/L with FIFO lots", () => {
    const f = setup("100000");
    const at = (p: string) => {
      f.clock.advance(MINUTE_MS);
      updateMarketAsset(f.ctx, "SOL", { price: p, change24h: "0" });
    };
    at("100");
    const b1 = placeOrder(f.ctx, { clientOrderId: cid(), symbol: "SOL", side: "buy", type: "market", quantity: "10" }).transaction!;
    at("200");
    const b2 = placeOrder(f.ctx, { clientOrderId: cid(), symbol: "SOL", side: "buy", type: "market", quantity: "10" }).transaction!;
    expect(b1.net).toBe("1001"); // 1000 + 0.1% fee
    expect(b2.net).toBe("2002");
    at("300");
    const s = placeOrder(f.ctx, { clientOrderId: cid(), symbol: "SOL", side: "sell", type: "market", quantity: "15" }).transaction!;
    // Proceeds 4500 − 4.50 fee = 4495.50; FIFO cost = 1001 (lot 1) + 5/10 × 2002 = 2002
    expect(s.net).toBe("4495.5");
    expect(s.costBasis).toBe("2002");
    expect(s.realizedPnl).toBe("2493.5");
    const v = value(f);
    const sol = v.positions.find((p) => p.symbol === "SOL")!;
    expect(sol.quantity.toFixed()).toBe("5");
    expect(sol.costBasis.toFixed()).toBe("1001");
    expect(sol.unrealizedPnl.toFixed()).toBe("499"); // 5 × 300 − 1001
    expect(v.realizedPnl.toFixed()).toBe("2493.5");
  });
});

describe("ledger integrity", () => {
  it("every transaction record matches its ledger movements", () => {
    const f = setup();
    placeOrder(f.ctx, { clientOrderId: cid(), symbol: "BTC", side: "buy", type: "market", quantity: "0.02" });
    placeOrder(f.ctx, { clientOrderId: cid(), symbol: "BTC", side: "sell", type: "market", quantity: "0.01" });
    deposit(f.ctx, { asset: "ETH", amount: "0.5" });
    withdraw(f.ctx, { asset: "ETH", amount: "0.1" });
    transfer(f.ctx, { asset: "BTC", amount: "0.005", from: "spot", to: "vault" });
    transfer(f.ctx, { asset: "USD", amount: "100", from: "spot", to: "vault" });
    adjustBalance(f.ctx, { direction: "debit", amount: "12.34", reason: "Correction", confirm: true });
    adjustBalance(f.ctx, { direction: "credit", amount: "1.5", reason: "Rebate", kind: "fee", confirm: true });
    for (const t of listTransactions(f.ctx.db)) {
      const full = getTransaction(f.ctx.db, t.id)!;
      const usd = sum(full.ledger!.filter((e) => e.asset === "USD").map((e) => e.amount));
      const asset = sum(full.ledger!.filter((e) => e.asset === t.asset && t.asset !== "USD").map((e) => e.amount));
      switch (t.type) {
        case "buy":
          expect(usd.toFixed()).toBe(D(t.net).neg().toFixed());
          expect(asset.toFixed()).toBe(t.quantity);
          break;
        case "sell":
          expect(usd.toFixed()).toBe(t.net);
          expect(asset.toFixed()).toBe(D(t.quantity!).neg().toFixed());
          break;
        case "transfer":
          expect(sum(full.ledger!.map((e) => e.amount)).toFixed()).toBe("0");
          break;
        case "withdrawal":
          if (t.asset !== "USD") expect(asset.toFixed()).toBe(D(t.quantity!).plus(t.feeQuantity!).neg().toFixed());
          break;
        default:
          if (t.asset === "USD") expect(usd.abs().toFixed()).toBe(D(t.net).toFixed());
      }
    }
    // Balances equal the sum of all ledger entries; lots match holdings.
    const a = getAccount(f.ctx);
    const btc = a.positions.find((p) => p.symbol === "BTC")!;
    expect(btc.spot).toBe("0.005");
    expect(btc.vault).toBe("0.005");
    expect(a.cash.vault).toBe("100");
    expect(a.positions.find((p) => p.symbol === "ETH")!.quantity).toBe(D("0.5").minus("0.1").minus("0.0015").toFixed());
  });

  it("persists data across application restarts", () => {
    const db = tempDbPath();
    const clock = new FakeClock();
    let f = createFlux({ dbPath: db.path, now: clock.now, provider: null, initialBalance: "9999" });
    placeOrder(f.ctx, { clientOrderId: cid(), symbol: "BTC", side: "buy", type: "market", quantity: "0.03" });
    updateMarketAsset(f.ctx, "ADA", { price: "1.2345" });
    const before = getAccount(f.ctx);
    const txCount = listTransactions(f.ctx.db).length;
    f.close();
    clock.advance(5 * MINUTE_MS);
    f = createFlux({ dbPath: db.path, now: clock.now, provider: null });
    const after = getAccount(f.ctx);
    expect(after.cash).toEqual(before.cash);
    expect(after.positions).toEqual(before.positions);
    expect(listTransactions(f.ctx.db)).toHaveLength(txCount);
    expect(f.ctx.market.quotes(clock.t - 5 * MINUTE_MS).quotes.find((q) => q.symbol === "ADA")!.price).toBe("1.2345");
    f.close();
    db.cleanup();
  });
});

describe("history and analytics", () => {
  it("builds history and analytics from the ledger", async () => {
    const clock = new FakeClock();
    flux = makeFlux({ clock });
    const f = flux;
    resetAccount(f.ctx, { confirm: "RESET", startingState: "demo" });
    const a = getAccount(f.ctx);
    expect(a.positions.length).toBeGreaterThan(4);
    const h = await portfolioHistory(f.ctx, "1M");
    expect(h.available).toBe(true);
    expect(h.points.length).toBeGreaterThan(100);
    const last = h.points[h.points.length - 1]!;
    expect(Math.abs(last.value - value(f).totalValue.toNumber())).toBeLessThan(1);
    const an = await analytics(f.ctx, "ALL");
    expect(an.totals.trades).toBeGreaterThan(5);
    expect(an.winLoss.closedTrades).toBeGreaterThan(0);
    expect(Number(an.totals.startValue)).toBeCloseTo(9999, 0);
    expect(an.monthly.length).toBeGreaterThanOrEqual(4);
    // Totals reconcile: P/L over all time = value − contributions.
    expect(Number(an.totals.pnl)).toBeCloseTo(value(f).totalReturn.toNumber(), 0);
  });

  it("reports empty analytics gracefully for a fresh account", async () => {
    const f = setup();
    const an = await analytics(f.ctx, "1M");
    expect(an.winLoss.winRate).toBeNull();
    expect(an.totals.trades).toBe(0);
  });
});
