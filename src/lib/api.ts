import type {
  AccountDTO,
  AnalyticsDTO,
  CandleInterval,
  FeeSettingsDTO,
  MarketMode,
  MarketSettingsDTO,
  OrderDTO,
  PortfolioHistoryDTO,
  PortfolioRange,
  PositionDetailDTO,
  Preferences,
  QuotesResponse,
  SettingsDTO,
  TransactionDTO,
  WalletAccount,
} from "@shared/types";
import type { Candle, DepthLevel, TapeTrade } from "@shared/market/controlled";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Unable to reach the FLUX FINANCE server. Check that it is running.", 0, "network_error");
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(`Unexpected response from server (HTTP ${res.status}).`, res.status, "bad_response");
  }
  if (!res.ok) {
    const e = (data as { error?: { message?: string; code?: string } } | null)?.error;
    throw new ApiError(e?.message ?? `Request failed (HTTP ${res.status}).`, res.status, e?.code ?? "request_failed");
  }
  return data as T;
}

export interface CandlesResponse {
  symbol: string;
  interval: CandleInterval;
  available: boolean;
  source: string;
  message: string | null;
  candles: Candle[];
}
export interface DepthResponse {
  symbol: string;
  available: boolean;
  bids: DepthLevel[];
  asks: DepthLevel[];
  spread: string | null;
  mid: string | null;
}
export interface TapeResponse {
  symbol: string;
  available: boolean;
  trades: TapeTrade[];
}
export interface SparklinesResponse {
  available: boolean;
  series: Record<string, number[]>;
}
export interface PlaceOrderBody {
  clientOrderId: string;
  symbol: string;
  side: "buy" | "sell";
  type: "market" | "limit";
  quantity: string;
  limitPrice?: string | null;
}

export const api = {
  quotes: () => request<QuotesResponse>("GET", "/api/market/quotes"),
  candles: (symbol: string, interval: CandleInterval, limit = 240) => request<CandlesResponse>("GET", `/api/market/${symbol}/candles?interval=${interval}&limit=${limit}`),
  depth: (symbol: string) => request<DepthResponse>("GET", `/api/market/${symbol}/depth`),
  tape: (symbol: string) => request<TapeResponse>("GET", `/api/market/${symbol}/trades`),
  sparklines: () => request<SparklinesResponse>("GET", "/api/market/sparklines"),
  account: () => request<AccountDTO>("GET", "/api/account"),
  history: (range: PortfolioRange) => request<PortfolioHistoryDTO>("GET", `/api/portfolio/history?range=${range}`),
  position: (symbol: string) => request<PositionDetailDTO>("GET", `/api/portfolio/positions/${symbol}`),
  analytics: (range: PortfolioRange) => request<AnalyticsDTO>("GET", `/api/analytics?range=${range}`),
  orders: () => request<{ orders: OrderDTO[] }>("GET", "/api/orders"),
  placeOrder: (body: PlaceOrderBody) => request<{ order: OrderDTO; transaction: TransactionDTO | null; duplicate: boolean }>("POST", "/api/orders", body),
  cancelOrder: (id: string) => request<{ order: OrderDTO }>("POST", `/api/orders/${id}/cancel`),
  transactions: () => request<{ transactions: TransactionDTO[] }>("GET", "/api/transactions"),
  transaction: (id: string) => request<TransactionDTO>("GET", `/api/transactions/${id}`),
  deposit: (body: { asset: string; amount: string; account: WalletAccount; note?: string }) => request<{ transaction: TransactionDTO }>("POST", "/api/wallet/deposit", body),
  withdraw: (body: { asset: string; amount: string; account: WalletAccount; note?: string }) => request<{ transaction: TransactionDTO }>("POST", "/api/wallet/withdraw", body),
  transfer: (body: { asset: string; amount: string; from: WalletAccount; to: WalletAccount; note?: string }) => request<{ transaction: TransactionDTO }>("POST", "/api/wallet/transfer", body),
  adjust: (body: { direction: "credit" | "debit"; amount: string; reason: string; note?: string; kind: "balance" | "fee"; confirm: boolean }) =>
    request<{ transaction: TransactionDTO }>("POST", "/api/account/adjustments", body),
  setCash: (body: { target: string; reason?: string; note?: string; confirm: boolean }) => request<{ transaction: TransactionDTO }>("POST", "/api/account/cash-balance", body),
  reset: (body: { confirm: string; initialBalance?: string; baselineAt?: number; startingState?: "cash" | "demo"; resetPreferences?: boolean; resetMarket?: boolean }) =>
    request<{ account: AccountDTO }>("POST", "/api/account/reset", body),
  settings: () => request<SettingsDTO>("GET", "/api/settings"),
  updatePreferences: (patch: Partial<Preferences>) => request<{ preferences: Preferences }>("PATCH", "/api/settings/preferences", patch),
  updateFees: (fees: FeeSettingsDTO) => request<{ fees: FeeSettingsDTO }>("PUT", "/api/settings/fees", fees),
  setMarketMode: (mode: MarketMode, seedFromLive = true) => request<{ market: MarketSettingsDTO }>("PUT", "/api/settings/market/mode", { mode, seedFromLive }),
  setMarketMotion: (body: { speed?: number; volatilityMultiplier?: number }) => request<{ market: MarketSettingsDTO }>("PUT", "/api/settings/market/motion", body),
  updateMarketAsset: (symbol: string, body: { price?: string; change24h?: string; enabled?: boolean; volatility?: string }) =>
    request<{ market: MarketSettingsDTO }>("PUT", `/api/settings/market/assets/${symbol}`, body),
  setChartIntervals: (intervals: CandleInterval[]) => request<{ market: MarketSettingsDTO }>("PUT", "/api/settings/market/intervals", { intervals }),
  resetMarket: () => request<{ market: MarketSettingsDTO }>("POST", "/api/settings/market/reset"),
  watch: (symbol: string) => request<{ watchlist: string[] }>("POST", `/api/watchlist/${symbol}`),
  unwatch: (symbol: string) => request<{ watchlist: string[] }>("DELETE", `/api/watchlist/${symbol}`),
};

export function newClientOrderId(): string {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `web-${rand}`;
}
