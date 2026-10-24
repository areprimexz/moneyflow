import { openDatabase, type DatabaseHandle } from "./db/client";
import { CoinGeckoProvider } from "./market/coingecko";
import { MarketDataService } from "./market/marketData";
import { ensureAccount } from "./services/account";
import type { Ctx } from "./services/context";
import { SettingsStore } from "./services/settingsStore";
import { matchOpenOrders } from "./services/trading";

export interface FluxOptions {
  dbPath: string;
  now?: () => number;
  provider?: CoinGeckoProvider | null;
  initialBalance?: string;
  livePollMs?: number;
}

export interface Flux {
  ctx: Ctx;
  handle: DatabaseHandle;
  startBackground(): void;
  close(): void;
}

/** Compose the application services around one SQLite database. */
export function createFlux(opts: FluxOptions): Flux {
  const handle = openDatabase(opts.dbPath);
  const store = new SettingsStore(handle.db);
  const provider =
    opts.provider !== undefined
      ? opts.provider
      : new CoinGeckoProvider({
          apiKey: process.env.COINGECKO_API_KEY,
          plan: process.env.COINGECKO_API_PLAN === "pro" ? "pro" : "demo",
          baseUrl: process.env.COINGECKO_BASE_URL || undefined,
        });
  const market = new MarketDataService(store, { provider, pollMs: opts.livePollMs });
  const ctx: Ctx = { db: handle.db, sqlite: handle.sqlite, store, market, now: opts.now ?? (() => Date.now()) };
  ensureAccount(ctx, { initialBalance: opts.initialBalance });
  let matcher: NodeJS.Timeout | null = null;
  return {
    ctx,
    handle,
    startBackground() {
      market.startPolling();
      if (!matcher) {
        matcher = setInterval(() => {
          try {
            matchOpenOrders(ctx);
          } catch (e) {
            console.error("[matcher]", e);
          }
        }, 2000);
        matcher.unref();
      }
    },
    close() {
      if (matcher) clearInterval(matcher);
      market.stopPolling();
      handle.close();
    },
  };
}
