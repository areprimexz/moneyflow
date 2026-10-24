import { describe, expect, it } from "vitest";
import { requireAsset } from "../../shared/assets";
import { D } from "../../shared/decimal";
import { computeFee } from "../../shared/engine/fees";
import { consumeFifo } from "../../shared/engine/lots";
import { checkAffordability, isMarketable, limitBuyReservation, maxBuyQuantity, planTrade } from "../../shared/engine/orders";
import { valuePortfolio } from "../../shared/engine/portfolio";
import type { AccountDTO, QuoteDTO } from "../../shared/types";

const BTC = requireAsset("BTC");

describe("fees", () => {
  it("rounds half-up to cents", () => {
    expect(computeFee("1124.82", "0.001").toFixed()).toBe("1.12");
    expect(computeFee("1125", "0.001").toFixed()).toBe("1.13");
    expect(computeFee("100", "0").toFixed()).toBe("0");
  });
});

describe("trade planning", () => {
  it("prices a buy with fee on top", () => {
    const r = planTrade({ side: "buy", quantity: D("0.01"), unitPrice: D("100000"), feeRate: D("0.001"), asset: BTC });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.gross.toFixed()).toBe("1000");
    expect(r.value.fee.toFixed()).toBe("1");
    expect(r.value.net.toFixed()).toBe("1001");
  });

  it("deducts the fee from sell proceeds", () => {
    const r = planTrade({ side: "sell", quantity: D("0.01"), unitPrice: D("100000"), feeRate: D("0.001"), asset: BTC });
    expect(r.ok && r.value.net.toFixed()).toBe("999");
  });

  it("rejects invalid quantities", () => {
    for (const q of ["0", "-1", "0.0000001"]) {
      expect(planTrade({ side: "buy", quantity: D(q), unitPrice: D("100000"), feeRate: D("0.001"), asset: BTC }).ok).toBe(false);
    }
  });

  it("rejects orders below the minimum value", () => {
    expect(planTrade({ side: "buy", quantity: D("0.000001"), unitPrice: D("100000"), feeRate: D("0.001"), asset: BTC }).ok).toBe(false);
  });

  it("rejects overspending and overselling", () => {
    const buy = planTrade({ side: "buy", quantity: D("1"), unitPrice: D("100000"), feeRate: D("0.001"), asset: BTC });
    if (!buy.ok) throw new Error("plan failed");
    const r = checkAffordability(buy.value, D("9999"), D("0"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("insufficient_funds");
    const sell = planTrade({ side: "sell", quantity: D("1"), unitPrice: D("100000"), feeRate: D("0.001"), asset: BTC });
    if (!sell.ok) throw new Error("plan failed");
    const s = checkAffordability(sell.value, D("0"), D("0.5"));
    expect(!s.ok && s.code).toBe("insufficient_quantity");
  });

  it("computes the maximum affordable quantity including fees", () => {
    const q = maxBuyQuantity(D("9999"), D("112480.35"), D("0.001"), BTC);
    const plan = planTrade({ side: "buy", quantity: q, unitPrice: D("112480.35"), feeRate: D("0.001"), asset: BTC });
    expect(plan.ok && plan.value.net.lte(9999)).toBe(true);
    const bigger = planTrade({ side: "buy", quantity: q.plus("0.000001"), unitPrice: D("112480.35"), feeRate: D("0.001"), asset: BTC });
    expect(bigger.ok && bigger.value.net.gt(9999)).toBe(true);
  });

  it("detects marketable limit orders and reservations", () => {
    expect(isMarketable("buy", D("100"), D("99"))).toBe(true);
    expect(isMarketable("buy", D("100"), D("101"))).toBe(false);
    expect(isMarketable("sell", D("100"), D("101"))).toBe(true);
    expect(limitBuyReservation(D("2"), D("100"), D("0.0008")).toFixed()).toBe("200.16");
  });
});

describe("FIFO lots", () => {
  const lots = [
    { id: "a", openedAt: 1, quantity: D("1"), cost: D("100.00") },
    { id: "b", openedAt: 2, quantity: D("1"), cost: D("200.00") },
  ];

  it("consumes the oldest lot first", () => {
    const r = consumeFifo(lots, D("1.5"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.consumptions.map((c) => [c.lotId, c.quantity.toFixed(), c.cost.toFixed()])).toEqual([
      ["a", "1", "100"],
      ["b", "0.5", "100"],
    ]);
    expect(r.value.costRemoved.toFixed()).toBe("200");
  });

  it("removes exactly the remaining cost of a lot over several partial sells", () => {
    let lot = { id: "x", openedAt: 1, quantity: D("3"), cost: D("100.00") };
    let removed = D(0);
    for (const q of ["1", "1", "1"]) {
      const r = consumeFifo([lot], D(q));
      if (!r.ok) throw new Error(r.error);
      const c = r.value.consumptions[0]!;
      removed = removed.plus(c.cost);
      lot = { ...lot, quantity: c.remainingQuantity, cost: c.remainingCost };
    }
    expect(removed.toFixed()).toBe("100");
    expect(lot.cost.toFixed()).toBe("0");
  });

  it("rejects consuming more than is held", () => {
    expect(consumeFifo(lots, D("2.5")).ok).toBe(false);
  });
});

describe("portfolio valuation", () => {
  const account: AccountDTO = {
    id: "main",
    initialBalance: "9999",
    baselineAt: 0,
    createdAt: 0,
    startingState: "cash",
    cash: { total: "5000", spot: "5000", vault: "0", reserved: "0", availableSpot: "5000" },
    positions: [{ symbol: "BTC", quantity: "0.05", spot: "0.05", vault: "0", reserved: "0", availableSpot: "0.05", costBasis: "5005", realizedPnl: "0", firstAcquiredAt: 0, openLots: 1 }],
    totals: { netContributions: "9999", realizedPnl: "0", feesPaid: "5", tradeCount: 1, transactionCount: 2 },
    openOrders: 0,
    revision: 2,
  };
  const quote = (price: string): QuoteDTO => ({ symbol: "BTC", price, change24h: "0", open24h: price, high24h: price, low24h: price, volume24h: null, enabled: true, source: "controlled", updatedAt: 0, stale: false });

  it("derives totals from cash and holdings", () => {
    const v = valuePortfolio(account, [quote("100000")]);
    expect(v.holdingsValue.toFixed()).toBe("5000");
    expect(v.totalValue.toFixed()).toBe("10000");
    expect(v.unrealizedPnl.toFixed()).toBe("-5");
    expect(v.totalReturn.toFixed()).toBe("1");
  });

  it("revalues when prices change", () => {
    const v = valuePortfolio(account, [quote("120000")]);
    expect(v.totalValue.toFixed()).toBe("11000");
    expect(v.unrealizedPnl.toFixed()).toBe("995");
    expect(v.positions[0]!.allocation.toDecimalPlaces(4).toFixed()).toBe("0.5455");
  });
});
