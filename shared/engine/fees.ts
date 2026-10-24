import { D, Dec, roundUsd, type DecimalLike } from "../decimal";

/**
 * Fee model
 * ---------
 * - Fees are charged in USD on every trade, on top of a buy and out of the proceeds of a sell.
 * - Market orders pay the taker rate; resting limit orders that fill later pay the maker rate.
 *   A limit order that is marketable on submission executes immediately as a taker.
 * - Fee = round_half_up(gross × rate, 2 decimals).
 */
export interface FeeSchedule {
  takerRate: string;
  makerRate: string;
}

export const DEFAULT_FEES: FeeSchedule = { takerRate: "0.001", makerRate: "0.0008" };
export const MAX_FEE_RATE = new Dec("0.05");

export function computeFee(gross: DecimalLike, rate: DecimalLike): Dec {
  const r = D(rate);
  if (r.isNegative()) throw new Error("Fee rate cannot be negative");
  return roundUsd(D(gross).times(r));
}
