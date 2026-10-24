import { Hono, type Context } from "hono";
import { z } from "zod";
import { symbolFromSlug } from "../shared/assets";
import { DomainError } from "../shared/engine/result";
import { CANDLE_INTERVALS, type CandleInterval } from "../shared/market/controlled";
import type { PortfolioRange } from "../shared/types";
import { adjustBalance, deposit, getAccount, resetAccount, setCashBalance, transfer, withdraw } from "./services/account";
import type { Ctx } from "./services/context";
import { getTransaction, listTransactions } from "./services/ledger";
import { analytics, isRange, portfolioHistory, positionDetail } from "./services/portfolio";
import {
  addToWatchlist,
  getSettings,
  marketSettings,
  removeFromWatchlist,
  setMarketMode,
  setMarketMotion,
  updateMarketAsset,
  updatePreferences,
} from "./services/settings";
import { cancelOrder, getFees, listOrders, matchOpenOrders, placeOrder, setFees } from "./services/trading";

async function body<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  let json: unknown;
  try {
    json = await c.req.json();
  } catch {
    throw new DomainError("Request body must be valid JSON.", "invalid_json");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new DomainError(issue ? `${issue.path.join(".") || "body"}: ${issue.message}` : "Invalid request", "invalid_request");
  }
  return parsed.data;
}

function symbolParam(c: Context): string {
  const symbol = symbolFromSlug(c.req.param("symbol"));
  if (!symbol) throw new DomainError("Unknown market.", "unknown_asset", 404);
  return symbol;
}

function rangeParam(c: Context, fallback: PortfolioRange): PortfolioRange {
  const r = c.req.query("range") ?? fallback;
  if (!isRange(r)) throw new DomainError("Unknown range.", "invalid_range");
  return r;
}

const orderSchema = z.object({
  clientOrderId: z.string().min(8).max(64),
  symbol: z.string(),
  side: z.enum(["buy", "sell"]),
  type: z.enum(["market", "limit"]),
  quantity: z.string().max(40),
  limitPrice: z.string().max(40).nullish(),
});
const walletSchema = z.object({ asset: z.string(), amount: z.string().max(40), account: z.enum(["spot", "vault"]).optional(), note: z.string().max(400).nullish() });
const transferSchema = z.object({ asset: z.string(), amount: z.string().max(40), from: z.enum(["spot", "vault"]), to: z.enum(["spot", "vault"]), note: z.string().max(400).nullish() });
const adjustmentSchema = z.object({
  direction: z.enum(["credit", "debit"]),
  amount: z.string().max(40),
  reason: z.string().max(200),
  note: z.string().max(400).nullish(),
  kind: z.enum(["balance", "fee"]).optional(),
  confirm: z.boolean(),
});
const cashSchema = z.object({ target: z.string().max(40), reason: z.string().max(200).optional(), note: z.string().max(400).nullish(), confirm: z.boolean() });
const resetSchema = z.object({
  confirm: z.string(),
  initialBalance: z.string().max(40).optional(),
  baselineAt: z.number().int().optional(),
  startingState: z.enum(["cash", "demo"]).optional(),
  resetPreferences: z.boolean().optional(),
  resetMarket: z.boolean().optional(),
});

export function createApi(ctx: Ctx): Hono {
  const app = new Hono();

  app.onError((e, c) => {
    if (e instanceof DomainError) return c.json({ error: { code: e.code, message: e.message } }, e.status as 400);
    console.error("[api]", e);
    return c.json({ error: { code: "internal_error", message: "An unexpected error occurred. No changes were applied." } }, 500);
  });
  app.notFound((c) => c.json({ error: { code: "not_found", message: "Endpoint not found." } }, 404));

  const fresh = () => matchOpenOrders(ctx);

  app.get("/api/health", (c) => c.json({ ok: true, time: ctx.now() }));

  // Market data ----------------------------------------------------------------
  app.get("/api/market/quotes", async (c) => {
    if (ctx.market.mode() === "live") await ctx.market.refreshLive(ctx.now());
    return c.json(ctx.market.quotes(ctx.now()));
  });
  app.get("/api/market/:symbol/candles", async (c) => {
    const symbol = symbolParam(c);
    const interval = (c.req.query("interval") ?? "1h") as CandleInterval;
    if (!(interval in CANDLE_INTERVALS)) throw new DomainError("Unknown chart interval.", "invalid_interval");
    const limit = Math.min(500, Math.max(10, Number(c.req.query("limit") ?? 200) || 200));
    return c.json({ symbol, interval, ...(await ctx.market.candles(symbol, interval, limit, ctx.now())) });
  });
  app.get("/api/market/:symbol/depth", (c) => {
    const symbol = symbolParam(c);
    const book = ctx.market.orderBook(symbol, ctx.now());
    return c.json({ symbol, available: book !== null, ...(book ?? { bids: [], asks: [], spread: null, mid: null }) });
  });
  app.get("/api/market/:symbol/trades", (c) => {
    const symbol = symbolParam(c);
    const trades = ctx.market.tape(symbol, ctx.now());
    return c.json({ symbol, available: trades !== null, trades: trades ?? [] });
  });

  // Account & portfolio --------------------------------------------------------
  app.get("/api/account", (c) => {
    fresh();
    return c.json(getAccount(ctx));
  });
  app.get("/api/portfolio/history", async (c) => c.json(await portfolioHistory(ctx, rangeParam(c, "7D"))));
  app.get("/api/portfolio/positions/:symbol", (c) => c.json(positionDetail(ctx, symbolParam(c))));
  app.get("/api/analytics", async (c) => {
    fresh();
    return c.json(await analytics(ctx, rangeParam(c, "1M")));
  });

  // Orders ---------------------------------------------------------------------
  app.get("/api/orders", (c) => {
    fresh();
    return c.json({ orders: listOrders(ctx) });
  });
  app.post("/api/orders", async (c) => {
    const input = await body(c, orderSchema);
    fresh();
    const result = placeOrder(ctx, input);
    return c.json(result, result.duplicate ? 200 : 201);
  });
  app.post("/api/orders/:id/cancel", (c) => {
    fresh();
    return c.json({ order: cancelOrder(ctx, c.req.param("id")) });
  });

  // Transactions ---------------------------------------------------------------
  app.get("/api/transactions", (c) => {
    fresh();
    return c.json({ transactions: listTransactions(ctx.db) });
  });
  app.get("/api/transactions/:id", (c) => {
    const tx = getTransaction(ctx.db, c.req.param("id"));
    if (!tx) throw new DomainError("Transaction not found.", "not_found", 404);
    return c.json(tx);
  });

  // Wallet (paper ledger only) ---------------------------------------------------
  app.post("/api/wallet/deposit", async (c) => c.json({ transaction: deposit(ctx, await body(c, walletSchema)) }, 201));
  app.post("/api/wallet/withdraw", async (c) => c.json({ transaction: withdraw(ctx, await body(c, walletSchema)) }, 201));
  app.post("/api/wallet/transfer", async (c) => c.json({ transaction: transfer(ctx, await body(c, transferSchema)) }, 201));

  // Account administration -------------------------------------------------------
  app.post("/api/account/adjustments", async (c) => c.json({ transaction: adjustBalance(ctx, await body(c, adjustmentSchema)) }, 201));
  app.post("/api/account/cash-balance", async (c) => c.json({ transaction: setCashBalance(ctx, await body(c, cashSchema)) }, 201));
  app.post("/api/account/reset", async (c) => c.json({ account: resetAccount(ctx, await body(c, resetSchema)) }));

  // Settings -------------------------------------------------------------------------
  app.get("/api/settings", (c) => c.json(getSettings(ctx)));
  app.patch("/api/settings/preferences", async (c) => c.json({ preferences: updatePreferences(ctx, await c.req.json().catch(() => null)) }));
  app.put("/api/settings/fees", async (c) => {
    const input = await body(c, z.object({ takerRate: z.string().max(20), makerRate: z.string().max(20) }));
    setFees(ctx, input);
    return c.json({ fees: getFees(ctx) });
  });
  app.put("/api/settings/market/mode", async (c) => {
    const input = await body(c, z.object({ mode: z.enum(["controlled", "live"]), seedFromLive: z.boolean().optional() }));
    return c.json({ market: setMarketMode(ctx, input.mode, input.seedFromLive ?? true) });
  });
  app.put("/api/settings/market/motion", async (c) => {
    const input = await body(c, z.object({ speed: z.number().optional(), volatilityMultiplier: z.number().optional() }));
    return c.json({ market: setMarketMotion(ctx, input) });
  });
  app.put("/api/settings/market/assets/:symbol", async (c) => {
    const input = await body(c, z.object({ price: z.string().max(40).optional(), change24h: z.string().max(20).optional(), enabled: z.boolean().optional(), volatility: z.string().max(20).optional() }));
    fresh();
    const result = updateMarketAsset(ctx, symbolParam(c), input);
    fresh();
    return c.json({ market: result });
  });
  app.put("/api/settings/market/intervals", async (c) => {
    const input = await body(c, z.object({ intervals: z.array(z.string()) }));
    try {
      ctx.market.setChartIntervals(input.intervals as CandleInterval[], ctx.now());
    } catch (e) {
      throw new DomainError(e instanceof Error ? e.message : "Invalid intervals", "invalid_intervals");
    }
    return c.json({ market: marketSettings(ctx) });
  });
  app.post("/api/settings/market/reset", (c) => {
    fresh();
    ctx.market.resetControlled(ctx.now());
    return c.json({ market: marketSettings(ctx) });
  });
  app.post("/api/watchlist/:symbol", (c) => c.json({ watchlist: addToWatchlist(ctx, symbolParam(c)) }));
  app.delete("/api/watchlist/:symbol", (c) => c.json({ watchlist: removeFromWatchlist(ctx, symbolParam(c)) }));

  return app;
}
