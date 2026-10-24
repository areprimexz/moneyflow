/**
 * Static asset catalogue. Prices here are only the *initial* controlled-market
 * reference values; live values come from the market data layer.
 */
export interface AssetMeta {
  symbol: string;
  name: string;
  /** CoinGecko id used by the optional live reference-price provider. */
  coingeckoId: string;
  category: string;
  color: string;
  glyph: string;
  /** Quantity precision (decimal places) for orders and balances. */
  qtyDecimals: number;
  /** Price precision (decimal places) for quotes. */
  priceDecimals: number;
  defaultPrice: string;
  /** Initial 24h reference change as a fraction (0.0186 = +1.86%). */
  defaultChange24h: string;
  /** Typical daily log-return volatility used by the synthetic market engine. */
  dailyVolatility: number;
  /** Typical 24h volume in USD used for simulated volume. */
  baseVolume24h: number;
  network: {
    name: string;
    standard: string | null;
    consensus: string;
    avgBlockTime: string;
    /** Reference confirmations an exchange would typically wait for. */
    confirmations: number;
    /** Simulated network fee charged on paper withdrawals, in asset units. */
    withdrawalFee: string;
    minWithdrawal: string;
  };
  description: string;
}

export const ASSETS: readonly AssetMeta[] = [
  {
    symbol: "BTC",
    name: "Bitcoin",
    coingeckoId: "bitcoin",
    category: "Layer 1",
    color: "#F7931A",
    glyph: "₿",
    qtyDecimals: 6,
    priceDecimals: 2,
    defaultPrice: "112480.35",
    defaultChange24h: "0.0186",
    dailyVolatility: 0.028,
    baseVolume24h: 38_200_000_000,
    network: { name: "Bitcoin", standard: null, consensus: "Proof of Work", avgBlockTime: "~10 min", confirmations: 2, withdrawalFee: "0.0002", minWithdrawal: "0.0005" },
    description: "The first decentralized digital currency, secured by proof-of-work mining.",
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    coingeckoId: "ethereum",
    category: "Layer 1",
    color: "#7B8CF0",
    glyph: "Ξ",
    qtyDecimals: 5,
    priceDecimals: 2,
    defaultPrice: "4126.88",
    defaultChange24h: "0.0241",
    dailyVolatility: 0.036,
    baseVolume24h: 21_600_000_000,
    network: { name: "Ethereum", standard: "Native", consensus: "Proof of Stake", avgBlockTime: "~12 s", confirmations: 12, withdrawalFee: "0.0015", minWithdrawal: "0.005" },
    description: "Programmable settlement layer for smart contracts and tokenized assets.",
  },
  {
    symbol: "SOL",
    name: "Solana",
    coingeckoId: "solana",
    category: "Layer 1",
    color: "#14C9A0",
    glyph: "◎",
    qtyDecimals: 4,
    priceDecimals: 2,
    defaultPrice: "196.42",
    defaultChange24h: "-0.0127",
    dailyVolatility: 0.05,
    baseVolume24h: 4_800_000_000,
    network: { name: "Solana", standard: "Native", consensus: "Proof of Stake / Proof of History", avgBlockTime: "~0.4 s", confirmations: 1, withdrawalFee: "0.01", minWithdrawal: "0.05" },
    description: "High-throughput layer-1 network optimised for low-latency applications.",
  },
  {
    symbol: "BNB",
    name: "BNB",
    coingeckoId: "binancecoin",
    category: "Exchange token",
    color: "#E8B530",
    glyph: "◆",
    qtyDecimals: 4,
    priceDecimals: 2,
    defaultPrice: "1084.17",
    defaultChange24h: "0.0064",
    dailyVolatility: 0.03,
    baseVolume24h: 1_900_000_000,
    network: { name: "BNB Smart Chain", standard: "BEP-20", consensus: "Proof of Staked Authority", avgBlockTime: "~3 s", confirmations: 15, withdrawalFee: "0.0005", minWithdrawal: "0.01" },
    description: "Native asset of the BNB Chain ecosystem used for gas and network fees.",
  },
  {
    symbol: "XRP",
    name: "XRP",
    coingeckoId: "ripple",
    category: "Payments",
    color: "#9AA8BA",
    glyph: "✕",
    qtyDecimals: 2,
    priceDecimals: 4,
    defaultPrice: "2.6143",
    defaultChange24h: "-0.0092",
    dailyVolatility: 0.045,
    baseVolume24h: 3_400_000_000,
    network: { name: "XRP Ledger", standard: "Native", consensus: "Federated consensus", avgBlockTime: "~4 s", confirmations: 1, withdrawalFee: "0.25", minWithdrawal: "20" },
    description: "Payment-focused ledger with fast settlement and low transaction costs.",
  },
  {
    symbol: "DOGE",
    name: "Dogecoin",
    coingeckoId: "dogecoin",
    category: "Payments",
    color: "#C9A93B",
    glyph: "Ð",
    qtyDecimals: 0,
    priceDecimals: 5,
    defaultPrice: "0.21487",
    defaultChange24h: "0.0418",
    dailyVolatility: 0.06,
    baseVolume24h: 1_600_000_000,
    network: { name: "Dogecoin", standard: null, consensus: "Proof of Work", avgBlockTime: "~1 min", confirmations: 40, withdrawalFee: "4", minWithdrawal: "50" },
    description: "Community-driven proof-of-work currency derived from Litecoin.",
  },
  {
    symbol: "ADA",
    name: "Cardano",
    coingeckoId: "cardano",
    category: "Layer 1",
    color: "#3C7BE8",
    glyph: "₳",
    qtyDecimals: 2,
    priceDecimals: 4,
    defaultPrice: "0.7312",
    defaultChange24h: "-0.0206",
    dailyVolatility: 0.048,
    baseVolume24h: 720_000_000,
    network: { name: "Cardano", standard: "Native", consensus: "Ouroboros Proof of Stake", avgBlockTime: "~20 s", confirmations: 15, withdrawalFee: "1", minWithdrawal: "10" },
    description: "Proof-of-stake platform built with a research-driven, formally verified approach.",
  },
  {
    symbol: "LINK",
    name: "Chainlink",
    coingeckoId: "chainlink",
    category: "Oracle",
    color: "#4F7BF7",
    glyph: "⬡",
    qtyDecimals: 3,
    priceDecimals: 3,
    defaultPrice: "19.284",
    defaultChange24h: "0.0311",
    dailyVolatility: 0.05,
    baseVolume24h: 610_000_000,
    network: { name: "Ethereum", standard: "ERC-20", consensus: "Proof of Stake", avgBlockTime: "~12 s", confirmations: 12, withdrawalFee: "0.35", minWithdrawal: "1" },
    description: "Decentralized oracle network delivering off-chain data to smart contracts.",
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    coingeckoId: "usd-coin",
    category: "Stablecoin",
    color: "#2F7FD8",
    glyph: "$",
    qtyDecimals: 2,
    priceDecimals: 4,
    defaultPrice: "1.0000",
    defaultChange24h: "0.0000",
    dailyVolatility: 0.0004,
    baseVolume24h: 9_800_000_000,
    network: { name: "Ethereum", standard: "ERC-20", consensus: "Proof of Stake", avgBlockTime: "~12 s", confirmations: 12, withdrawalFee: "2.5", minWithdrawal: "10" },
    description: "Fiat-collateralised stablecoin designed to track the US dollar 1:1.",
  },
  {
    symbol: "USDT",
    name: "Tether",
    coingeckoId: "tether",
    category: "Stablecoin",
    color: "#26A17B",
    glyph: "₮",
    qtyDecimals: 2,
    priceDecimals: 4,
    defaultPrice: "1.0001",
    defaultChange24h: "0.0001",
    dailyVolatility: 0.0004,
    baseVolume24h: 72_500_000_000,
    network: { name: "Ethereum", standard: "ERC-20", consensus: "Proof of Stake", avgBlockTime: "~12 s", confirmations: 12, withdrawalFee: "2.5", minWithdrawal: "10" },
    description: "Widely used dollar-pegged stablecoin issued across multiple networks.",
  },
];

export const ASSET_SYMBOLS = ASSETS.map((a) => a.symbol);

const BY_SYMBOL = new Map(ASSETS.map((a) => [a.symbol, a]));

export function getAsset(symbol: string): AssetMeta | undefined {
  return BY_SYMBOL.get(symbol.toUpperCase());
}

export function requireAsset(symbol: string): AssetMeta {
  const asset = getAsset(symbol);
  if (!asset) throw new Error(`Unknown asset: ${symbol}`);
  return asset;
}

export function isAssetSymbol(symbol: string): boolean {
  return BY_SYMBOL.has(symbol.toUpperCase());
}

/** Market pair label, e.g. "BTC/USD". */
export function pairLabel(symbol: string): string {
  return `${symbol}/USD`;
}

/** URL slug for a pair, e.g. "BTC-USD". */
export function pairSlug(symbol: string): string {
  return `${symbol}-USD`;
}

export function symbolFromSlug(slug: string | undefined): string | undefined {
  if (!slug) return undefined;
  const symbol = slug.toUpperCase().replace(/[-_/]?USD$/, "");
  return isAssetSymbol(symbol) ? symbol : undefined;
}
