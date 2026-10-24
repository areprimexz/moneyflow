import { ASSETS, getAsset } from "../../shared/assets";

/**
 * Optional live reference-price provider (CoinGecko public API).
 * Runs on the server only, so an API key (if configured) never reaches the browser.
 */
export interface LiveQuote {
  symbol: string;
  price: number;
  change24h: number | null;
  volume24h: number | null;
  high24h: number | null;
  low24h: number | null;
  updatedAt: number;
}

export class ProviderError extends Error {
  readonly status: number | null;
  readonly retryAfterMs: number | null;
  constructor(message: string, status: number | null = null, retryAfterMs: number | null = null) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export interface CoinGeckoOptions {
  baseUrl?: string;
  apiKey?: string;
  plan?: "demo" | "pro";
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class CoinGeckoProvider {
  readonly name = "CoinGecko";
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly plan: "demo" | "pro";
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: CoinGeckoOptions = {}) {
    this.plan = opts.plan ?? "demo";
    this.baseUrl = opts.baseUrl ?? (this.plan === "pro" ? "https://pro-api.coingecko.com/api/v3" : "https://api.coingecko.com/api/v3");
    this.apiKey = opts.apiKey || undefined;
    this.timeoutMs = opts.timeoutMs ?? 8000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  get hasApiKey(): boolean {
    return Boolean(this.apiKey);
  }

  private async get(path: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const headers: Record<string, string> = { accept: "application/json" };
    if (this.apiKey) headers[this.plan === "pro" ? "x-cg-pro-api-key" : "x-cg-demo-api-key"] = this.apiKey;
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, { headers, signal: controller.signal });
      if (res.status === 429) {
        const retry = Number(res.headers.get("retry-after"));
        throw new ProviderError("Rate limited by price provider", 429, Number.isFinite(retry) && retry > 0 ? retry * 1000 : 60_000);
      }
      if (!res.ok) throw new ProviderError(`Price provider responded with HTTP ${res.status}`, res.status);
      return await res.json();
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      if (e instanceof Error && e.name === "AbortError") throw new ProviderError("Price provider request timed out");
      throw new ProviderError(`Price provider unreachable: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      clearTimeout(timer);
    }
  }

  async fetchQuotes(): Promise<LiveQuote[]> {
    const ids = ASSETS.map((a) => a.coingeckoId).join(",");
    const data = await this.get(`/coins/markets?vs_currency=usd&ids=${ids}&price_change_percentage=24h&precision=full`);
    if (!Array.isArray(data)) throw new ProviderError("Unexpected response from price provider");
    const byId = new Map(ASSETS.map((a) => [a.coingeckoId, a.symbol]));
    const out: LiveQuote[] = [];
    for (const row of data as Record<string, unknown>[]) {
      const symbol = byId.get(String(row.id));
      const price = Number(row.current_price);
      if (!symbol || !Number.isFinite(price) || price <= 0) continue;
      const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
      const pct = num(row.price_change_percentage_24h);
      const updated = typeof row.last_updated === "string" ? Date.parse(row.last_updated) : NaN;
      out.push({
        symbol,
        price,
        change24h: pct === null ? null : pct / 100,
        volume24h: num(row.total_volume),
        high24h: num(row.high_24h),
        low24h: num(row.low_24h),
        updatedAt: Number.isFinite(updated) ? updated : Date.now(),
      });
    }
    if (out.length === 0) throw new ProviderError("Price provider returned no usable prices");
    return out;
  }

  /** Price history: CoinGecko picks 5-minute (≤1 day), hourly (≤90 days) or daily granularity. */
  async fetchHistory(symbol: string, days: number): Promise<{ time: number; price: number }[]> {
    const asset = getAsset(symbol);
    if (!asset) throw new ProviderError(`Unknown asset ${symbol}`);
    const data = (await this.get(`/coins/${asset.coingeckoId}/market_chart?vs_currency=usd&days=${days}`)) as { prices?: unknown };
    if (!data || !Array.isArray(data.prices)) throw new ProviderError("Unexpected history response from price provider");
    return (data.prices as unknown[])
      .filter((p): p is [number, number] => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
      .map(([time, price]) => ({ time, price }));
  }
}
