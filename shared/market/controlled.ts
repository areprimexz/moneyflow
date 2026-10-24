import { ASSETS, requireAsset } from "../assets";
import { D, Dec } from "../decimal";
import { fractalPath, hashString, PATH_NORMALIZER, rand01 } from "./noise";

/**
 * Controlled market engine
 * ------------------------
 * Prices are a deterministic function of time:
 *
 *   log P(t) = regime.logPrice + regime.sigma · k · (N(M(t)) − N(M(regime.start))) + Σ reshape(t)
 *
 * - N is a seeded fractal random-walk path (see noise.ts), identical on every call.
 * - M(t) is the market clock. Pausing or changing the movement rate appends a clock
 *   segment, so prices freeze or move faster *from that moment on* — history is kept.
 * - A regime starts whenever volatility changes; it is continuous with the previous one.
 * - A reshape is recorded when an operator sets a price and 24h reference change. It
 *   bends the previous 48h of synthetic history so that P(now) and the 24h change match
 *   the configured values exactly. History older than 48h is never rewritten.
 */

export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;
const RESHAPE_WINDOW_MS = DAY_MS;

export interface ClockSegment {
  realStart: number;
  marketStart: number;
  speed: number;
}
export interface Regime {
  start: number;
  logPrice: number;
  sigma: number;
}
export interface Reshape {
  at: number;
  a1: number;
  a2: number;
}
export interface ControlledAssetConfig {
  symbol: string;
  enabled: boolean;
  /** Per-asset daily volatility before the global multiplier. */
  baseVolatility: number;
  regimes: Regime[];
  reshapes: Reshape[];
}
export interface ControlledMarketConfig {
  version: 1;
  createdAt: number;
  /** Current movement rate multiplier (0 = paused). */
  speed: number;
  /** Current global volatility multiplier. */
  volatilityMultiplier: number;
  clock: ClockSegment[];
  assets: Record<string, ControlledAssetConfig>;
}

export const SPEED_OPTIONS = [0, 0.5, 1, 2, 4] as const;
export const VOLATILITY_OPTIONS = [0.5, 1, 1.5, 2.5] as const;

const seedCache = new Map<string, number>();
function seedOf(symbol: string): number {
  let s = seedCache.get(symbol);
  if (s === undefined) {
    s = hashString(`flux:${symbol}`);
    seedCache.set(symbol, s);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Construction & mutation (pure — every mutator returns a new config)
// ---------------------------------------------------------------------------

export function createDefaultMarket(now: number): ControlledMarketConfig {
  let cfg: ControlledMarketConfig = { version: 1, createdAt: now, speed: 1, volatilityMultiplier: 1, clock: [], assets: {} };
  for (const asset of ASSETS) {
    cfg.assets[asset.symbol] = {
      symbol: asset.symbol,
      enabled: true,
      baseVolatility: asset.dailyVolatility,
      regimes: [{ start: now, logPrice: Math.log(Number(asset.defaultPrice)), sigma: asset.dailyVolatility }],
      reshapes: [],
    };
    cfg = setReferencePrice(cfg, asset.symbol, now, D(asset.defaultPrice), D(asset.defaultChange24h));
  }
  return cfg;
}

function cloneAsset(a: ControlledAssetConfig): ControlledAssetConfig {
  return { ...a, regimes: [...a.regimes], reshapes: [...a.reshapes] };
}

function assetCfg(cfg: ControlledMarketConfig, symbol: string): ControlledAssetConfig {
  const a = cfg.assets[symbol];
  if (!a) throw new Error(`Asset ${symbol} is not configured in the controlled market`);
  return a;
}

/** Set price and 24h reference change at time `now`. */
export function setReferencePrice(cfg: ControlledMarketConfig, symbol: string, now: number, price: Dec, change24h: Dec): ControlledMarketConfig {
  if (!price.isFinite() || price.lte(0)) throw new Error("Price must be positive");
  if (!change24h.isFinite() || change24h.lte(-1)) throw new Error("24h change must be greater than -100%");
  const current = assetCfg(cfg, symbol);
  const logNow = logPriceAt(cfg, symbol, now);
  const logPrev = logPriceAt(cfg, symbol, now - RESHAPE_WINDOW_MS);
  const targetNow = Math.log(price.toNumber());
  const targetPrev = Math.log(price.div(change24h.plus(1)).toNumber());
  const next = cloneAsset(current);
  next.reshapes.push({ at: now, a1: targetPrev - logPrev, a2: targetNow - logNow });
  return { ...cfg, assets: { ...cfg.assets, [symbol]: next } };
}

function startRegime(cfg: ControlledMarketConfig, symbol: string, now: number, sigma: number): ControlledAssetConfig {
  const a = cloneAsset(assetCfg(cfg, symbol));
  a.regimes.push({ start: now, logPrice: baseLogAt(cfg, a, now), sigma });
  return a;
}

export function setVolatilityMultiplier(cfg: ControlledMarketConfig, now: number, multiplier: number): ControlledMarketConfig {
  if (!(multiplier > 0 && multiplier <= 10)) throw new Error("Volatility multiplier out of range");
  const assets: Record<string, ControlledAssetConfig> = {};
  for (const [symbol, a] of Object.entries(cfg.assets)) assets[symbol] = startRegime(cfg, symbol, now, a.baseVolatility * multiplier);
  return { ...cfg, volatilityMultiplier: multiplier, assets };
}

export function setAssetVolatility(cfg: ControlledMarketConfig, symbol: string, now: number, dailyVolatility: number): ControlledMarketConfig {
  if (!(dailyVolatility >= 0 && dailyVolatility <= 0.5)) throw new Error("Volatility out of range");
  const a = startRegime(cfg, symbol, now, dailyVolatility * cfg.volatilityMultiplier);
  a.baseVolatility = dailyVolatility;
  return { ...cfg, assets: { ...cfg.assets, [symbol]: a } };
}

export function setSpeed(cfg: ControlledMarketConfig, now: number, speed: number): ControlledMarketConfig {
  if (!(speed >= 0 && speed <= 16)) throw new Error("Movement rate out of range");
  const segment: ClockSegment = { realStart: now, marketStart: marketTime(cfg, now), speed };
  return { ...cfg, speed, clock: [...cfg.clock.filter((s) => s.realStart < now), segment] };
}

export function setEnabled(cfg: ControlledMarketConfig, symbol: string, enabled: boolean): ControlledMarketConfig {
  const a = cloneAsset(assetCfg(cfg, symbol));
  a.enabled = enabled;
  return { ...cfg, assets: { ...cfg.assets, [symbol]: a } };
}

/** Ensure every catalogue asset exists (forward-compatible with new listings). */
export function normalizeMarket(cfg: ControlledMarketConfig, now: number): ControlledMarketConfig {
  const missing = ASSETS.filter((a) => !cfg.assets[a.symbol]);
  if (missing.length === 0) return cfg;
  const fresh = createDefaultMarket(now);
  const assets = { ...cfg.assets };
  for (const a of missing) assets[a.symbol] = fresh.assets[a.symbol]!;
  return { ...cfg, assets };
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/** Market clock in milliseconds. */
export function marketTime(cfg: ControlledMarketConfig, t: number): number {
  let seg: ClockSegment | undefined;
  for (const s of cfg.clock) {
    if (s.realStart <= t) seg = s;
    else break;
  }
  if (!seg) return t;
  return seg.marketStart + seg.speed * (t - seg.realStart);
}

function regimeAt(a: ControlledAssetConfig, t: number): Regime {
  let r = a.regimes[0]!;
  for (const reg of a.regimes) {
    if (reg.start <= t) r = reg;
    else break;
  }
  return r;
}

function baseLogAt(cfg: ControlledMarketConfig, a: ControlledAssetConfig, t: number): number {
  const r = regimeAt(a, t);
  const seed = seedOf(a.symbol);
  const n = fractalPath(seed, marketTime(cfg, t) / 1000);
  const n0 = fractalPath(seed, marketTime(cfg, r.start) / 1000);
  return r.logPrice + r.sigma * PATH_NORMALIZER * (n - n0);
}

function reshapeAt(a: ControlledAssetConfig, t: number): number {
  let adj = 0;
  for (const r of a.reshapes) {
    const start = r.at - 2 * RESHAPE_WINDOW_MS;
    if (t <= start) continue;
    const mid = r.at - RESHAPE_WINDOW_MS;
    if (t >= r.at) adj += r.a2;
    else if (t >= mid) adj += r.a1 + ((r.a2 - r.a1) * (t - mid)) / RESHAPE_WINDOW_MS;
    else adj += (r.a1 * (t - start)) / RESHAPE_WINDOW_MS;
  }
  return adj;
}

export function logPriceAt(cfg: ControlledMarketConfig, symbol: string, t: number): number {
  const a = assetCfg(cfg, symbol);
  return baseLogAt(cfg, a, t) + reshapeAt(a, t);
}

/** Unrounded price as a float — used only for chart geometry. */
export function rawPriceAt(cfg: ControlledMarketConfig, symbol: string, t: number): number {
  return Math.exp(logPriceAt(cfg, symbol, t));
}

/** Quoted price, rounded to the asset's price precision. This is the execution price. */
export function priceAt(cfg: ControlledMarketConfig, symbol: string, t: number): Dec {
  const meta = requireAsset(symbol);
  const minTick = new Dec(1).div(new Dec(10).pow(meta.priceDecimals));
  const p = new Dec(rawPriceAt(cfg, symbol, t)).toDecimalPlaces(meta.priceDecimals, Dec.ROUND_HALF_UP);
  return p.lt(minTick) ? minTick : p;
}

export interface MarketQuote {
  symbol: string;
  price: string;
  change24h: string;
  open24h: string;
  high24h: string;
  low24h: string;
  volume24h: string;
  enabled: boolean;
}

export function quoteAt(cfg: ControlledMarketConfig, symbol: string, now: number): MarketQuote {
  const meta = requireAsset(symbol);
  const price = priceAt(cfg, symbol, now);
  const open = priceAt(cfg, symbol, now - DAY_MS);
  let hi = price.toNumber();
  let lo = hi;
  const samples = 144;
  for (let i = 0; i <= samples; i++) {
    const p = rawPriceAt(cfg, symbol, now - DAY_MS + (i * DAY_MS) / samples);
    if (p > hi) hi = p;
    if (p < lo) lo = p;
  }
  return {
    symbol,
    price: price.toFixed(meta.priceDecimals),
    change24h: price.div(open).minus(1).toDecimalPlaces(6).toFixed(),
    open24h: open.toFixed(meta.priceDecimals),
    high24h: new Dec(hi).toFixed(meta.priceDecimals),
    low24h: new Dec(lo).toFixed(meta.priceDecimals),
    volume24h: volumeBetween(cfg, symbol, now - DAY_MS, now).toFixed(0),
    enabled: assetCfg(cfg, symbol).enabled,
  };
}

// ---------------------------------------------------------------------------
// Volume, candles, depth and tape (all deterministic, labelled "simulated" in UI)
// ---------------------------------------------------------------------------

const ACTIVITY_BUCKET_MS = 15 * MINUTE_MS;

function activity(symbol: string, bucket: number): number {
  return 0.55 + 0.9 * rand01(seedOf(symbol), 7001, bucket);
}

function volumeBetween(cfg: ControlledMarketConfig, symbol: string, from: number, to: number): Dec {
  const meta = requireAsset(symbol);
  const speedFactor = cfg.speed === 0 ? 0.25 : 1;
  let total = 0;
  const first = Math.floor(from / ACTIVITY_BUCKET_MS);
  const last = Math.floor((to - 1) / ACTIVITY_BUCKET_MS);
  const step = Math.max(1, Math.floor((last - first + 1) / 96));
  for (let b = first; b <= last; b += step) {
    const bStart = Math.max(from, b * ACTIVITY_BUCKET_MS);
    const bEnd = Math.min(to, (b + step) * ACTIVITY_BUCKET_MS);
    if (bEnd <= bStart) continue;
    total += activity(symbol, b) * (bEnd - bStart);
  }
  return new Dec((meta.baseVolume24h * speedFactor * total) / DAY_MS);
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export const CANDLE_INTERVALS = {
  "1m": MINUTE_MS,
  "5m": 5 * MINUTE_MS,
  "15m": 15 * MINUTE_MS,
  "1h": HOUR_MS,
  "4h": 4 * HOUR_MS,
  "1D": DAY_MS,
  "1W": 7 * DAY_MS,
} as const;
export type CandleInterval = keyof typeof CANDLE_INTERVALS;

export function alignTime(t: number, intervalMs: number): number {
  if (intervalMs === CANDLE_INTERVALS["1W"]) {
    // Weeks start on Monday 00:00 UTC (the Unix epoch was a Thursday).
    const offset = 3 * DAY_MS;
    return Math.floor((t + offset) / intervalMs) * intervalMs - offset;
  }
  return Math.floor(t / intervalMs) * intervalMs;
}

export function candlesAt(cfg: ControlledMarketConfig, symbol: string, interval: CandleInterval, count: number, now: number): Candle[] {
  const meta = requireAsset(symbol);
  const ms = CANDLE_INTERVALS[interval];
  const sub = 12;
  const lastOpen = alignTime(now, ms);
  const seed = seedOf(symbol);
  const a = assetCfg(cfg, symbol);
  const sigmaInterval = Math.max(1e-6, regimeAt(a, now).sigma * Math.sqrt(ms / DAY_MS));
  const out: Candle[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const open = lastOpen - i * ms;
    const end = Math.min(open + ms, now);
    if (end <= open) continue;
    const o = rawPriceAt(cfg, symbol, open);
    const c = rawPriceAt(cfg, symbol, end);
    let hi = Math.max(o, c);
    let lo = Math.min(o, c);
    for (let s = 1; s < sub; s++) {
      const p = rawPriceAt(cfg, symbol, open + ((end - open) * s) / sub);
      if (p > hi) hi = p;
      if (p < lo) lo = p;
    }
    const idx = Math.floor(open / ms);
    const wick = sigmaInterval * 0.25;
    hi *= 1 + wick * rand01(seed, 8101, idx);
    lo *= 1 - wick * rand01(seed, 8102, idx);
    const move = Math.abs(Math.log(c / o)) / sigmaInterval;
    const vol = volumeBetween(cfg, symbol, open, end).toNumber() * (0.7 + 0.6 * Math.min(3, move)) * (0.8 + 0.4 * rand01(seed, 8103, idx));
    const round = (x: number) => Number(x.toFixed(meta.priceDecimals + 2));
    out.push({ time: open, open: round(o), high: round(hi), low: round(lo), close: round(c), volume: Math.round(vol) });
  }
  return out;
}

export interface SeriesPoint {
  time: number;
  value: number;
}

export function seriesAt(cfg: ControlledMarketConfig, symbol: string, from: number, to: number, step: number): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (let t = from; t <= to; t += step) out.push({ time: t, value: rawPriceAt(cfg, symbol, t) });
  if (out.length === 0 || out[out.length - 1]!.time !== to) out.push({ time: to, value: rawPriceAt(cfg, symbol, to) });
  return out;
}

export interface DepthLevel {
  price: string;
  quantity: string;
  total: string;
}

const SPREAD_BPS: Record<string, number> = { USDC: 0.5, USDT: 0.5, BTC: 0.8, ETH: 1, BNB: 2, SOL: 2, XRP: 2.5, LINK: 3, ADA: 3, DOGE: 3 };

export function orderBookAt(cfg: ControlledMarketConfig, symbol: string, now: number, levels = 12): { bids: DepthLevel[]; asks: DepthLevel[]; spread: string; mid: string } {
  const meta = requireAsset(symbol);
  const seed = seedOf(symbol);
  const mid = priceAt(cfg, symbol, now);
  const tick = new Dec(1).div(new Dec(10).pow(meta.priceDecimals));
  const halfSpread = Dec.max(tick, mid.times((SPREAD_BPS[symbol] ?? 2) / 20000)).toDecimalPlaces(meta.priceDecimals, Dec.ROUND_UP);
  const step = Dec.max(tick, mid.times(0.00012)).toDecimalPlaces(meta.priceDecimals, Dec.ROUND_UP);
  const bucket = Math.floor(now / 2000);
  const baseUsd = meta.baseVolume24h / 400_000;
  const build = (side: 1 | -1) => {
    const out: DepthLevel[] = [];
    let cum = new Dec(0);
    for (let i = 0; i < levels; i++) {
      const price = side === 1 ? mid.plus(halfSpread).plus(step.times(i)) : mid.minus(halfSpread).minus(step.times(i));
      if (price.lte(0)) break;
      const r = rand01(seed, 9000 + i * 2 + (side === 1 ? 1 : 0), bucket);
      const usd = baseUsd * (0.25 + 1.75 * r * r) * (1 + i * 0.09);
      const qty = new Dec(usd).div(price).toDecimalPlaces(meta.qtyDecimals, Dec.ROUND_DOWN);
      const q = qty.isZero() ? new Dec(1).div(new Dec(10).pow(meta.qtyDecimals)) : qty;
      cum = cum.plus(q);
      out.push({ price: price.toFixed(meta.priceDecimals), quantity: q.toFixed(meta.qtyDecimals), total: cum.toFixed(meta.qtyDecimals) });
    }
    return out;
  };
  return { bids: build(-1), asks: build(1), spread: halfSpread.times(2).toFixed(meta.priceDecimals), mid: mid.toFixed(meta.priceDecimals) };
}

export interface TapeTrade {
  id: string;
  time: number;
  side: "buy" | "sell";
  price: string;
  quantity: string;
}

export function recentTradesAt(cfg: ControlledMarketConfig, symbol: string, now: number, count = 24): TapeTrade[] {
  const meta = requireAsset(symbol);
  const seed = seedOf(symbol);
  const out: TapeTrade[] = [];
  const paused = cfg.speed === 0;
  // Fewer prints while the market clock is paused.
  const bucketMs = paused ? 15_000 : 1_000;
  let b = Math.floor(now / bucketMs);
  const baseUsd = meta.baseVolume24h / 2_000_000;
  for (let guard = 0; out.length < count && guard < 600; guard++, b--) {
    const n = Math.floor(rand01(seed, 9500, b) * 3); // 0..2 prints per bucket
    for (let k = n - 1; k >= 0 && out.length < count; k--) {
      const t = b * bucketMs + Math.floor(rand01(seed, 9501 + k, b) * bucketMs);
      if (t > now) continue;
      const p = rawPriceAt(cfg, symbol, t);
      const side = rand01(seed, 9510 + k, b) < 0.5 ? "buy" : "sell";
      const halfSpread = (p * (SPREAD_BPS[symbol] ?? 2)) / 20000;
      const price = side === "buy" ? p + halfSpread : p - halfSpread;
      const r = rand01(seed, 9520 + k, b);
      const qty = new Dec((baseUsd * (0.05 + 3 * r * r * r)) / p).toDecimalPlaces(meta.qtyDecimals, Dec.ROUND_DOWN);
      out.push({
        id: `${symbol}-${b}-${k}`,
        time: t,
        side,
        price: new Dec(price).toFixed(meta.priceDecimals),
        quantity: (qty.isZero() ? new Dec(1).div(new Dec(10).pow(meta.qtyDecimals)) : qty).toFixed(meta.qtyDecimals),
      });
    }
  }
  return out.sort((x, y) => y.time - x.time);
}

/**
 * Find the first time in (from, to] at which `predicate(price)` holds, sampling the
 * deterministic price path. Used to fill resting limit orders, including catch-up after
 * the server was offline.
 */
export function findFirstMatch(cfg: ControlledMarketConfig, symbol: string, from: number, to: number, predicate: (price: Dec) => boolean): { time: number; price: Dec } | null {
  if (to <= from) return null;
  const span = to - from;
  const step = Math.max(5_000, Math.ceil(span / 20_000));
  for (let t = Math.min(from + step, to); ; t = Math.min(t + step, to)) {
    const price = priceAt(cfg, symbol, t);
    if (predicate(price)) return { time: t, price };
    if (t >= to) break;
  }
  return null;
}
