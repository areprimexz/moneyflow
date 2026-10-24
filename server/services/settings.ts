import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { ASSETS, getAsset } from "../../shared/assets";
import { D } from "../../shared/decimal";
import { DomainError, unwrap } from "../../shared/engine/result";
import {
  CANDLE_INTERVALS,
  SPEED_OPTIONS,
  VOLATILITY_OPTIONS,
  quoteAt,
  setAssetVolatility,
  setEnabled,
  setReferencePrice,
  setSpeed,
  setVolatilityMultiplier,
  type CandleInterval,
} from "../../shared/market/controlled";
import { DEFAULT_PREFERENCES, PORTFOLIO_RANGES, type MarketMode, type MarketSettingsDTO, type Preferences, type SettingsDTO } from "../../shared/types";
import { LIMITS, parseDecimalInput } from "../../shared/validation";
import { watchlist } from "../db/schema";
import type { Ctx } from "./context";
import { getFees } from "./trading";

const KEY_PREFS = "preferences";
const intervalEnum = z.enum(Object.keys(CANDLE_INTERVALS) as [CandleInterval, ...CandleInterval[]]);
const rangeEnum = z.enum(PORTFOLIO_RANGES as [string, ...string[]]);

export const preferencesPatchSchema = z
  .object({
    theme: z.enum(["dark", "light"]),
    density: z.enum(["comfortable", "compact"]),
    compactNumbers: z.boolean(),
    hideSmallBalances: z.boolean(),
    chartType: z.enum(["candles", "line"]),
    showVolume: z.boolean(),
    defaultMarket: z.string().refine((s) => Boolean(getAsset(s)), "Unknown market"),
    defaultInterval: intervalEnum,
    portfolioRange: rangeEnum,
    performanceRange: rangeEnum,
    notifyOrderFills: z.boolean(),
    notifyLedgerChanges: z.boolean(),
    confirmOrders: z.boolean(),
    currency: z.literal("USD"),
  })
  .partial()
  .strict();

export function getPreferences(ctx: Ctx): Preferences {
  return { ...DEFAULT_PREFERENCES, ...(ctx.store.get<Partial<Preferences>>(KEY_PREFS) ?? {}) };
}

export function updatePreferences(ctx: Ctx, patch: unknown): Preferences {
  const parsed = preferencesPatchSchema.safeParse(patch);
  if (!parsed.success) throw new DomainError(parsed.error.issues[0]?.message ?? "Invalid preferences", "invalid_preferences");
  const next = { ...getPreferences(ctx), ...parsed.data } as Preferences;
  if (parsed.data.defaultMarket) next.defaultMarket = getAsset(parsed.data.defaultMarket)!.symbol;
  ctx.store.set(KEY_PREFS, next, ctx.now());
  return next;
}

export function marketSettings(ctx: Ctx): MarketSettingsDTO {
  const now = ctx.now();
  const cfg = ctx.market.controlled(now);
  const live = ctx.market.liveStatus();
  return {
    mode: ctx.market.mode(),
    speed: cfg.speed,
    volatilityMultiplier: cfg.volatilityMultiplier,
    chartIntervals: ctx.market.chartIntervals(),
    live: { provider: live.provider, configured: live.configured, hasApiKey: live.hasApiKey, pollSeconds: live.pollSeconds },
    assets: ASSETS.map((a) => {
      const c = cfg.assets[a.symbol]!;
      const q = quoteAt(cfg, a.symbol, now);
      return { symbol: a.symbol, enabled: c.enabled, baseVolatility: c.baseVolatility, price: q.price, change24h: q.change24h };
    }),
  };
}

export function getSettings(ctx: Ctx): SettingsDTO {
  return {
    preferences: getPreferences(ctx),
    market: marketSettings(ctx),
    fees: getFees(ctx),
    watchlist: ctx.db
      .select()
      .from(watchlist)
      .orderBy(asc(watchlist.addedAt))
      .all()
      .map((w) => w.symbol),
  };
}

export function setMarketMode(ctx: Ctx, mode: MarketMode, seedFromLive = true): MarketSettingsDTO {
  if (mode !== "controlled" && mode !== "live") throw new DomainError("Unknown market mode.", "invalid_mode");
  ctx.market.setMode(mode, ctx.now(), { seedFromLive });
  return marketSettings(ctx);
}

export function setMarketMotion(ctx: Ctx, input: { speed?: number; volatilityMultiplier?: number }): MarketSettingsDTO {
  const now = ctx.now();
  let cfg = ctx.market.controlled(now);
  if (input.speed !== undefined) {
    if (!(SPEED_OPTIONS as readonly number[]).includes(input.speed)) throw new DomainError("Unsupported movement rate.", "invalid_speed");
    if (input.speed !== cfg.speed) cfg = setSpeed(cfg, now, input.speed);
  }
  if (input.volatilityMultiplier !== undefined) {
    if (!(VOLATILITY_OPTIONS as readonly number[]).includes(input.volatilityMultiplier)) throw new DomainError("Unsupported volatility level.", "invalid_volatility");
    if (input.volatilityMultiplier !== cfg.volatilityMultiplier) cfg = setVolatilityMultiplier(cfg, now, input.volatilityMultiplier);
  }
  ctx.market.saveControlled(cfg, now);
  return marketSettings(ctx);
}

export function updateMarketAsset(ctx: Ctx, symbol: string, input: { price?: string; change24h?: string; enabled?: boolean; volatility?: string }): MarketSettingsDTO {
  const asset = getAsset(symbol);
  if (!asset) throw new DomainError(`Unknown asset ${symbol}.`, "unknown_asset", 404);
  const now = ctx.now();
  let cfg = ctx.market.controlled(now);
  if (input.price !== undefined || input.change24h !== undefined) {
    const current = quoteAt(cfg, asset.symbol, now);
    const price = unwrap(
      parseDecimalInput(input.price ?? current.price, { label: "Price", min: LIMITS.minAssetPrice, max: LIMITS.maxAssetPrice, maxDecimals: asset.priceDecimals }),
    );
    // change24h is entered as a percentage (e.g. "2.5" = +2.5%).
    const changePct = unwrap(
      parseDecimalInput(input.change24h ?? D(current.change24h).times(100).toFixed(), { label: "24h change", allowZero: true, allowNegative: true, maxDecimals: 4 }),
    );
    const change = changePct.div(100);
    if (change.lt(LIMITS.minChange24h) || change.gt(LIMITS.maxChange24h)) throw new DomainError("24h change must be between -95% and +1000%.", "invalid_change");
    cfg = setReferencePrice(cfg, asset.symbol, now, price, change);
  }
  if (input.volatility !== undefined) {
    const vol = unwrap(parseDecimalInput(input.volatility, { label: "Volatility", allowZero: true, max: D(50), maxDecimals: 2 }));
    cfg = setAssetVolatility(cfg, asset.symbol, now, vol.div(100).toNumber());
  }
  if (input.enabled !== undefined) cfg = setEnabled(cfg, asset.symbol, input.enabled);
  ctx.market.saveControlled(cfg, now);
  return marketSettings(ctx);
}

export function addToWatchlist(ctx: Ctx, symbol: string): string[] {
  const asset = getAsset(symbol);
  if (!asset) throw new DomainError(`Unknown asset ${symbol}.`, "unknown_asset", 404);
  ctx.db.insert(watchlist).values({ symbol: asset.symbol, addedAt: ctx.now() }).onConflictDoNothing().run();
  return getSettings(ctx).watchlist;
}

export function removeFromWatchlist(ctx: Ctx, symbol: string): string[] {
  ctx.db.delete(watchlist).where(eq(watchlist.symbol, symbol.toUpperCase())).run();
  return getSettings(ctx).watchlist;
}
