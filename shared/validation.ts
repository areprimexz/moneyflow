import { D, Dec } from "./decimal";

/** Application-wide limits for user-entered values. */
export const LIMITS = {
  /** Largest cash amount accepted for balances, deposits and adjustments. */
  maxUsdAmount: new Dec("1000000000000"), // $1 trillion
  /** Largest unit price accepted in controlled-market mode. */
  maxAssetPrice: new Dec("10000000"),
  /** Smallest unit price accepted in controlled-market mode. */
  minAssetPrice: new Dec("0.000001"),
  /** Largest 24h reference change (as a fraction, e.g. 0.95 = +95%). */
  maxChange24h: new Dec("10"),
  minChange24h: new Dec("-0.95"),
  /** Smallest order value in USD. */
  minOrderValue: new Dec("1"),
  maxOrderValue: new Dec("1000000000"),
  maxNoteLength: 280,
} as const;

export type ParseResult = { ok: true; value: Dec } | { ok: false; error: string };

const NUMERIC_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)$/;

/**
 * Parse a user-entered decimal string. Accepts thousands separators (",")
 * and an optional leading "$". Rejects empty, non-numeric and non-finite input.
 */
export function parseDecimalInput(
  raw: string | number | null | undefined,
  opts: {
    label?: string;
    allowZero?: boolean;
    allowNegative?: boolean;
    max?: Dec;
    min?: Dec;
    maxDecimals?: number;
  } = {},
): ParseResult {
  const label = opts.label ?? "Value";
  if (raw === null || raw === undefined) return { ok: false, error: `${label} is required.` };
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return { ok: false, error: `${label} must be a finite number.` };
    raw = String(raw);
  }
  const cleaned = raw.trim().replace(/^\$/, "").replace(/,/g, "").replace(/\s/g, "");
  if (cleaned === "") return { ok: false, error: `${label} is required.` };
  if (!NUMERIC_PATTERN.test(cleaned)) return { ok: false, error: `${label} must be a valid number.` };
  let value: Dec;
  try {
    value = D(cleaned);
  } catch {
    return { ok: false, error: `${label} must be a valid number.` };
  }
  if (!value.isFinite()) return { ok: false, error: `${label} must be a finite number.` };
  if (value.isNegative() && !value.isZero() && !opts.allowNegative) return { ok: false, error: `${label} cannot be negative.` };
  if (value.isZero() && !opts.allowZero) return { ok: false, error: `${label} must be greater than zero.` };
  if (opts.min && value.lt(opts.min)) return { ok: false, error: `${label} must be at least ${opts.min.toFixed()}.` };
  if (opts.max && value.gt(opts.max)) return { ok: false, error: `${label} exceeds the maximum of ${opts.max.toFixed()}.` };
  if (opts.maxDecimals !== undefined && value.decimalPlaces() > opts.maxDecimals) {
    return {
      ok: false,
      error: opts.maxDecimals === 0 ? `${label} must be a whole number.` : `${label} supports at most ${opts.maxDecimals} decimal places.`,
    };
  }
  return { ok: true, value };
}

export function parseUsdInput(raw: string | number | null | undefined, opts: { label?: string; allowZero?: boolean; max?: Dec } = {}): ParseResult {
  return parseDecimalInput(raw, {
    label: opts.label ?? "Amount",
    allowZero: opts.allowZero,
    max: opts.max ?? LIMITS.maxUsdAmount,
    maxDecimals: 2,
  });
}
