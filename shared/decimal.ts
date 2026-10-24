import Decimal from "decimal.js";

/**
 * All money and quantity arithmetic in FLUX FINANCE goes through decimal.js.
 * Values are persisted as canonical decimal strings, never as binary floats.
 */
export const Dec = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -30, toExpPos: 40 });
export type Dec = InstanceType<typeof Dec>;

export type DecimalLike = Dec | string | number;

export const ZERO = new Dec(0);

export function D(value: DecimalLike): Dec {
  return value instanceof Dec ? value : new Dec(value);
}

/** USD amounts are stored with cent precision. */
export const USD_DECIMALS = 2;

export function roundUsd(value: DecimalLike, rounding: Decimal.Rounding = Dec.ROUND_HALF_UP): Dec {
  return D(value).toDecimalPlaces(USD_DECIMALS, rounding);
}

export function roundQty(value: DecimalLike, decimals: number, rounding: Decimal.Rounding = Dec.ROUND_DOWN): Dec {
  return D(value).toDecimalPlaces(decimals, rounding);
}

/** Canonical string for persistence: fixed notation, no exponent, trailing zeros trimmed. */
export function toDbString(value: DecimalLike): string {
  const d = D(value);
  if (d.isZero()) return "0";
  return d.toFixed();
}

export function sum(values: Iterable<DecimalLike>): Dec {
  let total = ZERO;
  for (const v of values) total = total.plus(D(v));
  return total;
}

export function minDec(a: DecimalLike, b: DecimalLike): Dec {
  return Dec.min(D(a), D(b));
}

export function maxDec(a: DecimalLike, b: DecimalLike): Dec {
  return Dec.max(D(a), D(b));
}

export function toNumber(value: DecimalLike): number {
  return D(value).toNumber();
}
