import { D, Dec, type DecimalLike } from "./decimal";

/**
 * Formatting helpers. USD is the only ledger and display currency.
 * Decimal values are formatted from their exact decimal representation
 * (no float round-trips), so "$9,999.99" is always rendered precisely.
 */

function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function splitFixed(value: Dec, decimals: number): { negative: boolean; int: string; frac: string } {
  const fixed = value.abs().toFixed(decimals, Dec.ROUND_HALF_UP);
  const [int, frac = ""] = fixed.split(".");
  const negative = value.isNegative() && !new Dec(fixed).isZero();
  return { negative, int: int ?? "0", frac };
}

export interface UsdFormatOptions {
  /** Prefix positive values with "+" (used for P/L). */
  signed?: boolean;
  decimals?: number;
  /** Abbreviate large values ($1.25M). */
  compact?: boolean;
}

export function formatUsd(value: DecimalLike | null | undefined, opts: UsdFormatOptions = {}): string {
  if (value === null || value === undefined) return "—";
  const d = D(value);
  if (!d.isFinite()) return "—";
  if (opts.compact && d.abs().gte(100_000)) return formatCompactUsd(d, opts.signed);
  const { negative, int, frac } = splitFixed(d, opts.decimals ?? 2);
  const body = `$${groupThousands(int)}${frac ? `.${frac}` : ""}`;
  if (negative) return `-${body}`;
  if (opts.signed && !d.isZero()) return `+${body}`;
  return body;
}

export function formatCompactUsd(value: DecimalLike, signed = false): string {
  const d = D(value);
  const abs = d.abs();
  const units: [Dec, string][] = [
    [new Dec("1e12"), "T"],
    [new Dec("1e9"), "B"],
    [new Dec("1e6"), "M"],
    [new Dec("1e3"), "K"],
  ];
  let body = `$${groupThousands(abs.toFixed(2).split(".")[0] ?? "0")}`;
  for (const [threshold, suffix] of units) {
    if (abs.gte(threshold)) {
      body = `$${abs.div(threshold).toFixed(2)}${suffix}`;
      break;
    }
  }
  if (d.isNegative() && !d.isZero()) return `-${body}`;
  if (signed && !d.isZero()) return `+${body}`;
  return body;
}

/** Plain grouped number without currency symbol. */
export function formatNumber(value: DecimalLike | null | undefined, decimals = 2, opts: { trim?: boolean; signed?: boolean } = {}): string {
  if (value === null || value === undefined) return "—";
  const d = D(value);
  if (!d.isFinite()) return "—";
  const { negative, int, frac } = splitFixed(d, decimals);
  let fracOut = frac;
  if (opts.trim) fracOut = fracOut.replace(/0+$/, "");
  const body = `${groupThousands(int)}${fracOut ? `.${fracOut}` : ""}`;
  if (negative) return `-${body}`;
  if (opts.signed && !d.isZero()) return `+${body}`;
  return body;
}

/** Asset unit price, using the asset's price precision. */
export function formatPrice(value: DecimalLike | null | undefined, priceDecimals = 2): string {
  if (value === null || value === undefined) return "—";
  return formatUsd(value, { decimals: priceDecimals });
}

/** Asset quantity with the asset's quantity precision. */
export function formatQty(value: DecimalLike | null | undefined, decimals: number, opts: { trim?: boolean; signed?: boolean } = {}): string {
  return formatNumber(value, decimals, { trim: opts.trim ?? false, signed: opts.signed });
}

/** Percentage from a fraction: 0.0214 → "+2.14%". */
export function formatPct(fraction: DecimalLike | null | undefined, opts: { signed?: boolean; decimals?: number } = {}): string {
  if (fraction === null || fraction === undefined) return "—";
  const d = D(fraction);
  if (!d.isFinite()) return "—";
  const pct = d.times(100);
  const { negative, int, frac } = splitFixed(pct, opts.decimals ?? 2);
  const body = `${groupThousands(int)}${frac ? `.${frac}` : ""}%`;
  if (negative) return `-${body}`;
  if ((opts.signed ?? true) && !pct.toDecimalPlaces(opts.decimals ?? 2).isZero()) return `+${body}`;
  return body;
}

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});
const dateFormatter = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "2-digit" });
const timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const shortDateTimeFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

export function formatDateTime(ms: number): string {
  return dateTimeFormatter.format(new Date(ms));
}
export function formatDate(ms: number): string {
  return dateFormatter.format(new Date(ms));
}
export function formatTime(ms: number): string {
  return timeFormatter.format(new Date(ms));
}
export function formatShortDateTime(ms: number): string {
  return shortDateTimeFormatter.format(new Date(ms));
}

export function formatRelative(ms: number, now = Date.now()): string {
  const diff = Math.max(0, now - ms);
  const s = Math.floor(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/** Plain text decimal for inputs (no grouping). */
export function toInputString(value: DecimalLike, decimals: number): string {
  return D(value).toDecimalPlaces(decimals, Dec.ROUND_DOWN).toFixed();
}
