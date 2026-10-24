import { getAsset } from "../assets";
import { D, Dec, ZERO, sum } from "../decimal";
import type { AccountDTO, QuoteDTO } from "../types";

/**
 * Portfolio valuation (single implementation shared by client and server).
 *
 *   Market value       = quantity × current price
 *   Unrealized P/L     = market value − remaining cost basis
 *   Total value        = cash (Spot + Vault) + Σ market values
 *   Total return       = (total value − net contributions) / net contributions
 */
export interface PositionValuation {
  symbol: string;
  name: string;
  quantity: Dec;
  spot: Dec;
  vault: Dec;
  availableSpot: Dec;
  reserved: Dec;
  price: Dec | null;
  change24h: Dec | null;
  marketValue: Dec;
  costBasis: Dec;
  averageEntry: Dec | null;
  unrealizedPnl: Dec;
  unrealizedPct: Dec | null;
  realizedPnl: Dec;
  /** Value change over the quote's 24h window for the quantity currently held. */
  dayChangeValue: Dec;
  allocation: Dec;
}

export interface PortfolioValuation {
  totalValue: Dec;
  cash: Dec;
  cashSpot: Dec;
  cashVault: Dec;
  cashAvailable: Dec;
  cashReserved: Dec;
  holdingsValue: Dec;
  costBasis: Dec;
  unrealizedPnl: Dec;
  realizedPnl: Dec;
  netContributions: Dec;
  totalReturn: Dec;
  totalReturnPct: Dec | null;
  cashAllocation: Dec;
  positions: PositionValuation[];
  /** True when every held asset has a price. */
  complete: boolean;
}

export function valuePortfolio(account: AccountDTO, quotes: readonly QuoteDTO[] | undefined): PortfolioValuation {
  const quoteMap = new Map((quotes ?? []).map((q) => [q.symbol, q]));
  const cash = D(account.cash.total);
  let complete = true;
  const positions = account.positions
    .filter((p) => D(p.quantity).gt(0))
    .map((p) => {
      const q = quoteMap.get(p.symbol);
      const price = q ? D(q.price) : null;
      if (!price) complete = false;
      const quantity = D(p.quantity);
      const costBasis = D(p.costBasis);
      const marketValue = price ? quantity.times(price) : ZERO;
      const unrealized = price ? marketValue.minus(costBasis) : ZERO;
      const open = q?.open24h ? D(q.open24h) : null;
      return {
        symbol: p.symbol,
        name: getAsset(p.symbol)?.name ?? p.symbol,
        quantity,
        spot: D(p.spot),
        vault: D(p.vault),
        availableSpot: D(p.availableSpot),
        reserved: D(p.reserved),
        price,
        change24h: q ? D(q.change24h) : null,
        marketValue,
        costBasis,
        averageEntry: quantity.gt(0) ? costBasis.div(quantity) : null,
        unrealizedPnl: unrealized,
        unrealizedPct: costBasis.gt(0) && price ? unrealized.div(costBasis) : null,
        realizedPnl: D(p.realizedPnl),
        dayChangeValue: price && open ? quantity.times(price.minus(open)) : ZERO,
        allocation: ZERO,
      } satisfies PositionValuation;
    });
  const holdingsValue = sum(positions.map((p) => p.marketValue));
  const totalValue = cash.plus(holdingsValue);
  for (const p of positions) p.allocation = totalValue.gt(0) ? p.marketValue.div(totalValue) : ZERO;
  positions.sort((a, b) => b.marketValue.comparedTo(a.marketValue));
  const netContributions = D(account.totals.netContributions);
  const totalReturn = totalValue.minus(netContributions);
  return {
    totalValue,
    cash,
    cashSpot: D(account.cash.spot),
    cashVault: D(account.cash.vault),
    cashAvailable: D(account.cash.availableSpot),
    cashReserved: D(account.cash.reserved),
    holdingsValue,
    costBasis: sum(positions.map((p) => p.costBasis)),
    unrealizedPnl: sum(positions.map((p) => p.unrealizedPnl)),
    realizedPnl: D(account.totals.realizedPnl),
    netContributions,
    totalReturn,
    totalReturnPct: netContributions.gt(0) ? totalReturn.div(netContributions) : null,
    cashAllocation: totalValue.gt(0) ? cash.div(totalValue) : new Dec(1),
    positions,
    complete,
  };
}
