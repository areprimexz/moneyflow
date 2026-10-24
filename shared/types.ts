import type { CandleInterval } from "./market/controlled";
import type { OrderSide, OrderStatus, OrderType } from "./engine/orders";

export type { CandleInterval, OrderSide, OrderStatus, OrderType };

export type MarketMode = "controlled" | "live";
export type PriceSourceKind = "controlled" | "live" | "controlled-fallback";
export type WalletAccount = "spot" | "vault";
export type PortfolioRange = "1H" | "24H" | "7D" | "1M" | "3M" | "1Y" | "ALL";
export const PORTFOLIO_RANGES: PortfolioRange[] = ["1H", "24H", "7D", "1M", "3M", "1Y", "ALL"];

export interface QuoteDTO {
  symbol: string;
  price: string;
  change24h: string;
  open24h: string | null;
  high24h: string | null;
  low24h: string | null;
  volume24h: string | null;
  enabled: boolean;
  source: PriceSourceKind;
  updatedAt: number;
  stale: boolean;
}

export interface QuotesResponse {
  mode: MarketMode;
  serverTime: number;
  status: "ok" | "degraded" | "unavailable";
  message: string | null;
  lastSuccessAt: number | null;
  speed: number;
  volatilityMultiplier: number;
  quotes: QuoteDTO[];
}

export interface PositionDTO {
  symbol: string;
  quantity: string;
  spot: string;
  vault: string;
  /** Quantity locked by open sell limit orders. */
  reserved: string;
  availableSpot: string;
  costBasis: string;
  realizedPnl: string;
  firstAcquiredAt: number | null;
  openLots: number;
}

export interface AccountDTO {
  id: string;
  initialBalance: string;
  baselineAt: number;
  createdAt: number;
  startingState: "cash" | "demo";
  cash: { total: string; spot: string; vault: string; reserved: string; availableSpot: string };
  positions: PositionDTO[];
  totals: {
    /** Opening balance + deposits − withdrawals ± administrative adjustments, in USD. */
    netContributions: string;
    realizedPnl: string;
    feesPaid: string;
    tradeCount: number;
    transactionCount: number;
  };
  openOrders: number;
  revision: number;
}

export type TransactionType = "buy" | "sell" | "deposit" | "withdrawal" | "transfer" | "fee_adjustment" | "balance_adjustment";
export const TRANSACTION_TYPES: TransactionType[] = ["buy", "sell", "deposit", "withdrawal", "transfer", "fee_adjustment", "balance_adjustment"];
export type TransactionStatus = "settled";

export interface LedgerEntryDTO {
  id: string;
  transactionId: string;
  account: WalletAccount;
  asset: string;
  amount: string;
  createdAt: number;
}

export interface TransactionDTO {
  id: string;
  seq: number;
  type: TransactionType;
  status: TransactionStatus;
  asset: string;
  quantity: string | null;
  unitPrice: string | null;
  gross: string;
  fee: string;
  net: string;
  direction: "in" | "out" | "internal";
  account: WalletAccount;
  counterAccount: WalletAccount | null;
  orderId: string | null;
  realizedPnl: string | null;
  costBasis: string | null;
  feeAsset: string;
  feeQuantity: string | null;
  reason: string | null;
  note: string | null;
  createdAt: number;
  ledger?: LedgerEntryDTO[];
}

export interface OrderDTO {
  id: string;
  clientOrderId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: string;
  limitPrice: string | null;
  status: OrderStatus;
  feeRate: string;
  /** USD reserved (buy) or asset quantity reserved (sell) while open. */
  reserved: string;
  filledPrice: string | null;
  filledAt: number | null;
  transactionId: string | null;
  liquidity: "maker" | "taker" | null;
  cancelReason: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface PortfolioPointDTO {
  time: number;
  value: number;
  cash: number;
  holdings: number;
}

export interface PortfolioHistoryDTO {
  range: PortfolioRange;
  from: number;
  to: number;
  available: boolean;
  message: string | null;
  source: PriceSourceKind;
  points: PortfolioPointDTO[];
  /** Portfolio value at `from` (or at the account baseline if later). */
  startValue: string;
  /** Net external flows (deposits, withdrawals, adjustments) after `from`. */
  flows: string;
}

export interface LotDTO {
  id: string;
  symbol: string;
  openedAt: number;
  transactionId: string;
  originalQuantity: string;
  originalCost: string;
  quantity: string;
  cost: string;
}

export interface PositionDetailDTO {
  symbol: string;
  lots: LotDTO[];
  transactions: TransactionDTO[];
}

export interface Preferences {
  theme: "dark" | "light";
  density: "comfortable" | "compact";
  compactNumbers: boolean;
  hideSmallBalances: boolean;
  chartType: "candles" | "line";
  showVolume: boolean;
  defaultMarket: string;
  defaultInterval: CandleInterval;
  portfolioRange: PortfolioRange;
  performanceRange: PortfolioRange;
  notifyOrderFills: boolean;
  notifyLedgerChanges: boolean;
  currency: "USD";
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "dark",
  density: "comfortable",
  compactNumbers: false,
  hideSmallBalances: false,
  chartType: "candles",
  showVolume: true,
  defaultMarket: "BTC",
  defaultInterval: "1h",
  portfolioRange: "7D",
  performanceRange: "24H",
  notifyOrderFills: true,
  notifyLedgerChanges: true,
  currency: "USD",
};

export interface MarketAssetSettingsDTO {
  symbol: string;
  enabled: boolean;
  baseVolatility: number;
  price: string;
  change24h: string;
}

export interface MarketSettingsDTO {
  mode: MarketMode;
  speed: number;
  volatilityMultiplier: number;
  chartIntervals: CandleInterval[];
  live: { provider: string; configured: boolean; hasApiKey: boolean; pollSeconds: number };
  assets: MarketAssetSettingsDTO[];
}

export interface FeeSettingsDTO {
  takerRate: string;
  makerRate: string;
}

export interface SettingsDTO {
  preferences: Preferences;
  market: MarketSettingsDTO;
  fees: FeeSettingsDTO;
  watchlist: string[];
}

export interface AnalyticsDTO {
  range: PortfolioRange;
  available: boolean;
  message: string | null;
  history: PortfolioPointDTO[];
  dailyPnl: { time: number; pnl: number }[];
  monthly: { month: string; startValue: number; endValue: number; flows: number; returnPct: number | null }[];
  cumulativeReturn: { time: number; value: number }[];
  volume: { time: number; buy: number; sell: number }[];
  totals: {
    startValue: string;
    endValue: string;
    flows: string;
    pnl: string;
    returnPct: string | null;
    realizedPnl: string;
    tradingVolume: string;
    feesPaid: string;
    trades: number;
    buys: number;
    sells: number;
  };
  winLoss: {
    closedTrades: number;
    wins: number;
    losses: number;
    winRate: string | null;
    averageWin: string | null;
    averageLoss: string | null;
    profitFactor: string | null;
    largestWin: string | null;
    largestLoss: string | null;
  };
  assetPerformance: { symbol: string; startValue: string; endValue: string; netInvested: string; pnl: string; returnPct: string | null; realizedPnl: string }[];
}

export interface ApiErrorBody {
  error: { code: string; message: string; field?: string };
}
