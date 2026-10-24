import { ASSETS, requireAsset } from "../../shared/assets";
import { Dec } from "../../shared/decimal";
import { err, ok, type Result } from "../../shared/engine/result";
import {
  CANDLE_INTERVALS,
  DAY_MS,
  alignTime,
  candlesAt,
  createDefaultMarket,
  findFirstMatch,
  normalizeMarket,
  orderBookAt,
  priceAt,
  quoteAt,
  rawPriceAt,
  recentTradesAt,
  setReferencePrice,
  type Candle,
  type CandleInterval,
  type ControlledMarketConfig,
} from "../../shared/market/controlled";
import type { MarketMode, PriceSourceKind, QuoteDTO, QuotesResponse } from "../../shared/types";
import type { SettingsStore } from "../services/settingsStore";
import { ProviderError, type CoinGeckoProvider, type LiveQuote } from "./coingecko";

export const ALL_INTERVALS = Object.keys(CANDLE_INTERVALS) as CandleInterval[];
const KEY_MODE = "market.mode";
const KEY_CONTROLLED = "market.controlled";
const KEY_INTERVALS = "market.chartIntervals";

interface LiveState {
  quotes: Map<string, LiveQuote>;
  fetchedAt: number | null;
  lastAttemptAt: number | null;
  lastError: string | null;
  rateLimitedUntil: number;
  inflight: Promise<void> | null;
}

interface HistoryCacheEntry {
  fetchedAt: number;
  points: { time: number; price: number }[];
}

export interface MarketDataOptions {
  provider: CoinGeckoProvider | null;
  pollMs?: number;
  staleMs?: number;
}

/**
 * The single market data layer. Every price used anywhere in the application —
 * quotes, charts, valuations, order execution and limit matching — comes from here.
 */
export class MarketDataService {
  readonly provider: CoinGeckoProvider | null;
  readonly pollMs: number;
  readonly staleMs: number;
  private readonly store: SettingsStore;
  private live: LiveState = { quotes: new Map(), fetchedAt: null, lastAttemptAt: null, lastError: null, rateLimitedUntil: 0, inflight: null };
  private history = new Map<string, HistoryCacheEntry>();
  private historyInflight = new Map<string, Promise<HistoryCacheEntry>>();
  private timer: NodeJS.Timeout | null = null;

  constructor(store: SettingsStore, opts: MarketDataOptions) {
    this.store = store;
    this.provider = opts.provider;
    this.pollMs = opts.pollMs ?? 30_000;
    this.staleMs = opts.staleMs ?? 180_000;
  }

  // ----------------------------------------------------------------- config
  mode(): MarketMode {
    return this.store.get<MarketMode>(KEY_MODE) ?? "controlled";
  }

  controlled(now: number): ControlledMarketConfig {
    const existing = this.store.get<ControlledMarketConfig>(KEY_CONTROLLED);
    if (existing) {
      const normalized = normalizeMarket(existing, now);
      if (normalized !== existing) this.store.set(KEY_CONTROLLED, normalized, now);
      return normalized;
    }
    const cfg = createDefaultMarket(now);
    this.store.set(KEY_CONTROLLED, cfg, now);
    return cfg;
  }

  saveControlled(cfg: ControlledMarketConfig, now: number): void {
    this.store.set(KEY_CONTROLLED, cfg, now);
  }

  resetControlled(now: number): void {
    this.store.set(KEY_CONTROLLED, createDefaultMarket(now), now);
  }

  chartIntervals(): CandleInterval[] {
    const v = this.store.get<CandleInterval[]>(KEY_INTERVALS);
    const valid = (v ?? ALL_INTERVALS).filter((i) => ALL_INTERVALS.includes(i));
    return valid.length > 0 ? valid : ALL_INTERVALS;
  }

  setChartIntervals(intervals: CandleInterval[], now: number): void {
    const valid = ALL_INTERVALS.filter((i) => intervals.includes(i));
    if (valid.length === 0) throw new Error("At least one chart interval must remain enabled");
    this.store.set(KEY_INTERVALS, valid, now);
  }

  setMode(mode: MarketMode, now: number, opts: { seedFromLive?: boolean } = {}): void {
    const previous = this.mode();
    if (previous === "live" && mode === "controlled" && opts.seedFromLive && this.live.fetchedAt !== null) {
      let cfg = this.controlled(now);
      for (const q of this.live.quotes.values()) {
        const meta = requireAsset(q.symbol);
        const price = new Dec(q.price).toDecimalPlaces(meta.priceDecimals);
        if (price.lte(0)) continue;
        cfg = setReferencePrice(cfg, q.symbol, now, price, new Dec(q.change24h ?? 0));
      }
      this.saveControlled(cfg, now);
    }
    this.store.set(KEY_MODE, mode, now);
    if (mode === "live") void this.refreshLive(now, true);
  }

  isEnabled(symbol: string, now: number): boolean {
    return this.controlled(now).assets[symbol]?.enabled ?? false;
  }

  // ------------------------------------------------------------------- live
  liveStatus() {
    return {
      provider: this.provider?.name ?? "None",
      configured: this.provider !== null,
      hasApiKey: this.provider?.hasApiKey ?? false,
      pollSeconds: Math.round(this.pollMs / 1000),
      fetchedAt: this.live.fetchedAt,
      lastError: this.live.lastError,
    };
  }

  /** Fetch live quotes unless a fresh copy is cached, a request is in flight, or we are rate limited. */
  async refreshLive(now = Date.now(), force = false): Promise<void> {
    if (!this.provider) return;
    if (this.live.inflight) return this.live.inflight;
    if (now < this.live.rateLimitedUntil) return;
    if (!force && this.live.lastAttemptAt !== null && now - this.live.lastAttemptAt < this.pollMs) return;
    this.live.lastAttemptAt = now;
    const provider = this.provider;
    this.live.inflight = (async () => {
      try {
        const quotes = await provider.fetchQuotes();
        this.live.quotes = new Map(quotes.map((q) => [q.symbol, q]));
        this.live.fetchedAt = Date.now();
        this.live.lastError = null;
      } catch (e) {
        this.live.lastError = e instanceof Error ? e.message : String(e);
        if (e instanceof ProviderError && e.status === 429) this.live.rateLimitedUntil = Date.now() + (e.retryAfterMs ?? 60_000);
      } finally {
        this.live.inflight = null;
      }
    })();
    return this.live.inflight;
  }

  startPolling(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (this.mode() === "live") void this.refreshLive(Date.now());
    }, Math.max(5_000, Math.floor(this.pollMs / 2)));
    this.timer.unref();
    if (this.mode() === "live") void this.refreshLive(Date.now(), true);
  }

  stopPolling(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private liveFresh(now: number): boolean {
    return this.live.fetchedAt !== null && now - this.live.fetchedAt <= this.staleMs;
  }

  // ----------------------------------------------------------------- quotes
  quotes(now: number): QuotesResponse {
    const cfg = this.controlled(now);
    const mode = this.mode();
    const quotes: QuoteDTO[] = [];
    let status: QuotesResponse["status"] = "ok";
    let message: string | null = null;
    if (mode === "live") {
      if (this.live.fetchedAt === null) {
        status = "unavailable";
        message = this.provider
          ? `Live reference prices are unavailable${this.live.lastError ? ` (${this.live.lastError})` : ""}. Showing controlled-market prices; trading is paused until live prices load or you switch to Controlled mode.`
          : "No live price provider is configured. Showing controlled-market prices.";
      } else if (!this.liveFresh(now)) {
        status = "degraded";
        message = `Live prices are stale (last update ${Math.round((now - this.live.fetchedAt) / 60000)} min ago)${this.live.lastError ? `: ${this.live.lastError}` : ""}. Market orders are paused.`;
      }
    }
    for (const asset of ASSETS) {
      const enabled = cfg.assets[asset.symbol]?.enabled ?? true;
      const live = mode === "live" ? this.live.quotes.get(asset.symbol) : undefined;
      if (live && this.live.fetchedAt !== null) {
        const dp = asset.priceDecimals;
        const fx = (v: number | null) => (v === null ? null : new Dec(v).toFixed(dp));
        const change = live.change24h;
        quotes.push({
          symbol: asset.symbol,
          price: new Dec(live.price).toFixed(dp),
          change24h: change === null ? "0" : new Dec(change).toDecimalPlaces(6).toFixed(),
          open24h: change === null ? null : new Dec(live.price).div(1 + change).toFixed(dp),
          high24h: fx(live.high24h),
          low24h: fx(live.low24h),
          volume24h: live.volume24h === null ? null : new Dec(live.volume24h).toFixed(0),
          enabled,
          source: "live",
          updatedAt: this.live.fetchedAt,
          stale: !this.liveFresh(now),
        });
      } else {
        const q = quoteAt(cfg, asset.symbol, now);
        const source: PriceSourceKind = mode === "live" ? "controlled-fallback" : "controlled";
        quotes.push({ ...q, enabled, source, updatedAt: now, stale: false });
      }
    }
    return {
      mode,
      serverTime: now,
      status,
      message,
      lastSuccessAt: mode === "live" ? this.live.fetchedAt : now,
      speed: cfg.speed,
      volatilityMultiplier: cfg.volatilityMultiplier,
      quotes,
    };
  }

  /** The price an order executes at right now, or the reason trading is unavailable. */
  executionPrice(symbol: string, now: number): Result<{ price: Dec; source: PriceSourceKind }> {
    const meta = requireAsset(symbol);
    const cfg = this.controlled(now);
    if (!cfg.assets[symbol]?.enabled) return err(`${symbol}/USD trading is currently halted in market settings.`, "market_halted");
    if (this.mode() === "controlled") return ok({ price: priceAt(cfg, symbol, now), source: "controlled" });
    const live = this.live.quotes.get(symbol);
    if (!live || this.live.fetchedAt === null) return err("Live reference prices are unavailable. Switch to Controlled market mode in Settings to keep paper trading.", "price_unavailable");
    if (!this.liveFresh(now)) return err("Live reference prices are stale. Trading resumes when fresh prices arrive.", "price_stale");
    return ok({ price: new Dec(live.price).toDecimalPlaces(meta.priceDecimals), source: "live" });
  }

  /**
   * First time in (from, to] at which a resting order's condition holds.
   * Controlled mode inspects the deterministic path; live mode only the latest fresh quote.
   */
  findMatch(symbol: string, from: number, to: number, predicate: (price: Dec) => boolean): { time: number; price: Dec } | null {
    const cfg = this.controlled(to);
    if (!cfg.assets[symbol]?.enabled) return null;
    if (this.mode() === "controlled") return findFirstMatch(cfg, symbol, from, to, predicate);
    const r = this.executionPrice(symbol, to);
    if (!r.ok) return null;
    return predicate(r.value.price) ? { time: to, price: r.value.price } : null;
  }

  // ---------------------------------------------------------------- history
  private historyDays(spanMs: number): number {
    const needed = Math.ceil(spanMs / DAY_MS);
    for (const d of [1, 7, 30, 90, 365]) if (needed <= d) return d;
    return 365;
  }

  private async liveHistory(symbol: string, days: number): Promise<HistoryCacheEntry> {
    if (!this.provider) throw new ProviderError("No live price provider is configured");
    const key = `${symbol}:${days}`;
    const ttl = days <= 1 ? 120_000 : days <= 30 ? 600_000 : 1_800_000;
    const cached = this.history.get(key);
    if (cached && Date.now() - cached.fetchedAt < ttl) return cached;
    const inflight = this.historyInflight.get(key);
    if (inflight) return inflight;
    if (Date.now() < this.live.rateLimitedUntil) {
      if (cached) return cached;
      throw new ProviderError("Rate limited by price provider", 429);
    }
    const provider = this.provider;
    const p = (async () => {
      try {
        const points = await provider.fetchHistory(symbol, days);
        const entry = { fetchedAt: Date.now(), points };
        this.history.set(key, entry);
        return entry;
      } catch (e) {
        if (e instanceof ProviderError && e.status === 429) this.live.rateLimitedUntil = Date.now() + (e.retryAfterMs ?? 60_000);
        if (cached) return cached;
        throw e;
      } finally {
        this.historyInflight.delete(key);
      }
    })();
    this.historyInflight.set(key, p);
    return p;
  }

  /**
   * Prices for each symbol at each sample time, from the active data source.
   * Returns `available: false` (never fabricated data) if live history cannot be loaded.
   */
  async priceSeries(symbols: string[], times: number[], now: number): Promise<{ available: boolean; source: PriceSourceKind; message: string | null; prices: Map<string, number[]> }> {
    const prices = new Map<string, number[]>();
    const cfg = this.controlled(now);
    if (this.mode() === "controlled" || symbols.length === 0) {
      for (const s of symbols) prices.set(s, times.map((t) => rawPriceAt(cfg, s, t)));
      return { available: true, source: "controlled", message: null, prices };
    }
    if (times.length === 0) return { available: true, source: "live", message: null, prices };
    const days = this.historyDays(now - times[0]!);
    try {
      for (const s of symbols) {
        const h = await this.liveHistory(s, days);
        const latest = this.live.quotes.get(s);
        const pts = latest ? [...h.points, { time: this.live.fetchedAt ?? now, price: latest.price }] : h.points;
        prices.set(s, times.map((t) => interpolate(pts, t)));
      }
      return { available: true, source: "live", message: null, prices };
    } catch (e) {
      return { available: false, source: "live", message: `Historical prices are unavailable from the live provider: ${e instanceof Error ? e.message : String(e)}`, prices };
    }
  }

  async candles(symbol: string, interval: CandleInterval, limit: number, now: number): Promise<{ available: boolean; source: PriceSourceKind; message: string | null; candles: Candle[] }> {
    const cfg = this.controlled(now);
    if (this.mode() === "controlled") return { available: true, source: "controlled", message: null, candles: candlesAt(cfg, symbol, interval, limit, now) };
    const ms = CANDLE_INTERVALS[interval];
    const days = this.historyDays(ms * limit);
    try {
      const h = await this.liveHistory(symbol, days);
      const buckets = new Map<number, Candle>();
      const latest = this.live.quotes.get(symbol);
      const pts = latest ? [...h.points, { time: this.live.fetchedAt ?? now, price: latest.price }] : h.points;
      for (const p of pts) {
        const t = alignTime(p.time, ms);
        const c = buckets.get(t);
        if (!c) buckets.set(t, { time: t, open: p.price, high: p.price, low: p.price, close: p.price, volume: 0 });
        else {
          c.high = Math.max(c.high, p.price);
          c.low = Math.min(c.low, p.price);
          c.close = p.price;
        }
      }
      const candles = [...buckets.values()].sort((a, b) => a.time - b.time).slice(-limit);
      const coarse = h.points.length > 1 ? h.points[1]!.time - h.points[0]!.time : 0;
      const message = coarse > ms * 1.5 ? `The live provider's granularity is coarser than ${interval}; candles are aggregated from available points.` : null;
      return { available: true, source: "live", message, candles };
    } catch (e) {
      return { available: false, source: "live", message: `Chart data is unavailable from the live provider: ${e instanceof Error ? e.message : String(e)}`, candles: [] };
    }
  }

  orderBook(symbol: string, now: number) {
    if (this.mode() !== "controlled") return null;
    return orderBookAt(this.controlled(now), symbol, now, 12);
  }

  tape(symbol: string, now: number) {
    if (this.mode() !== "controlled") return null;
    return recentTradesAt(this.controlled(now), symbol, now, 28);
  }

  /** Point-in-time price used for valuations (controlled path or live history). */
  valuationPrice(symbol: string, at: number, now: number): Dec | null {
    if (this.mode() === "controlled") return priceAt(this.controlled(now), symbol, at);
    const r = this.executionPrice(symbol, now);
    return r.ok ? r.value.price : null;
  }
}

function interpolate(points: { time: number; price: number }[], t: number): number {
  if (points.length === 0) return NaN;
  if (t <= points[0]!.time) return points[0]!.price;
  const last = points[points.length - 1]!;
  if (t >= last.time) return last.price;
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid]!.time <= t) lo = mid;
    else hi = mid;
  }
  const a = points[lo]!;
  const b = points[hi]!;
  return a.price + ((b.price - a.price) * (t - a.time)) / (b.time - a.time);
}
