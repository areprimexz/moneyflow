import { describe, expect, it } from "vitest";
import { D } from "../../shared/decimal";
import {
  DAY_MS,
  HOUR_MS,
  candlesAt,
  createDefaultMarket,
  priceAt,
  quoteAt,
  rawPriceAt,
  setReferencePrice,
  setSpeed,
  setVolatilityMultiplier,
} from "../../shared/market/controlled";

const T = Date.UTC(2026, 9, 1, 12);

describe("controlled market engine", () => {
  it("starts at the catalogue reference price and 24h change", () => {
    const cfg = createDefaultMarket(T);
    const q = quoteAt(cfg, "BTC", T);
    expect(q.price).toBe("112480.35");
    expect(D(q.change24h).toDecimalPlaces(4).toFixed()).toBe("0.0186");
  });

  it("is deterministic across calls", () => {
    const a = createDefaultMarket(T);
    const b = createDefaultMarket(T);
    expect(candlesAt(a, "ETH", "1h", 50, T + 5 * HOUR_MS)).toEqual(candlesAt(b, "ETH", "1h", 50, T + 5 * HOUR_MS));
    expect(priceAt(a, "SOL", T + 12345).toFixed()).toBe(priceAt(b, "SOL", T + 12345).toFixed());
  });

  it("applies an operator price and 24h change exactly", () => {
    const now = T + 3 * DAY_MS;
    const cfg = setReferencePrice(createDefaultMarket(T), "ETH", now, D("5000"), D("0.1"));
    const q = quoteAt(cfg, "ETH", now);
    expect(q.price).toBe("5000.00");
    expect(D(q.change24h).toDecimalPlaces(3).toFixed()).toBe("0.1");
  });

  it("never rewrites history older than 48 hours", () => {
    const now = T + 10 * DAY_MS;
    const before = createDefaultMarket(T);
    const after = setReferencePrice(before, "BTC", now, D("50000"), D("-0.2"));
    for (const back of [3 * DAY_MS, 5 * DAY_MS, 9 * DAY_MS]) {
      expect(rawPriceAt(after, "BTC", now - back)).toBeCloseTo(rawPriceAt(before, "BTC", now - back), 6);
    }
  });

  it("freezes prices while the market clock is paused and keeps history continuous", () => {
    const pausedAt = T + DAY_MS;
    const cfg = setSpeed(createDefaultMarket(T), pausedAt, 0);
    expect(priceAt(cfg, "BTC", pausedAt + HOUR_MS).toFixed()).toBe(priceAt(cfg, "BTC", pausedAt).toFixed());
    expect(rawPriceAt(cfg, "BTC", pausedAt - HOUR_MS)).toBeCloseTo(rawPriceAt(createDefaultMarket(T), "BTC", pausedAt - HOUR_MS), 6);
  });

  it("keeps prices continuous when volatility changes", () => {
    const at = T + DAY_MS;
    const before = createDefaultMarket(T);
    const after = setVolatilityMultiplier(before, at, 2.5);
    expect(rawPriceAt(after, "SOL", at)).toBeCloseTo(rawPriceAt(before, "SOL", at), 6);
  });

  it("produces realistic daily volatility", () => {
    const cfg = createDefaultMarket(T);
    let s2 = 0;
    const n = 400;
    for (let i = 0; i < n; i++) {
      const t = T - i * DAY_MS;
      const r = Math.log(rawPriceAt(cfg, "BTC", t) / rawPriceAt(cfg, "BTC", t - DAY_MS));
      s2 += r * r;
    }
    const sigma = Math.sqrt(s2 / n);
    expect(sigma).toBeGreaterThan(0.012);
    expect(sigma).toBeLessThan(0.06);
  });

  it("builds continuous candles", () => {
    const candles = candlesAt(createDefaultMarket(T), "BTC", "15m", 40, T);
    for (let i = 1; i < candles.length; i++) {
      expect(candles[i]!.open).toBeCloseTo(candles[i - 1]!.close, 2);
      expect(candles[i]!.high).toBeGreaterThanOrEqual(Math.max(candles[i]!.open, candles[i]!.close));
      expect(candles[i]!.low).toBeLessThanOrEqual(Math.min(candles[i]!.open, candles[i]!.close));
    }
  });
});
