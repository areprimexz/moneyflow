import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { D, type DecimalLike } from "@shared/decimal";
import { formatPct, formatQty, formatUsd } from "@shared/format";
import { cn } from "@/lib/cn";
import { usePreferences } from "@/lib/queries";

function sign(value: DecimalLike | null | undefined): -1 | 0 | 1 {
  if (value === null || value === undefined) return 0;
  const d = D(value);
  return d.isZero() ? 0 : d.isNegative() ? -1 : 1;
}

function toneClass(value: DecimalLike | null | undefined): string {
  const s = sign(value);
  return s > 0 ? "text-up" : s < 0 ? "text-down" : "text-muted";
}

/** USD amount. Respects the compact-number preference only when `compactable`. */
export function Money({ value, signed, tone, className, compactable, decimals }: { value: DecimalLike | null | undefined; signed?: boolean; tone?: boolean; className?: string; compactable?: boolean; decimals?: number }) {
  const prefs = usePreferences();
  return <span className={cn("num", tone && toneClass(value), className)}>{formatUsd(value, { signed, compact: compactable && prefs.compactNumbers, decimals })}</span>;
}

export function Pct({ value, className, tone = true, signed = true }: { value: DecimalLike | null | undefined; className?: string; tone?: boolean; signed?: boolean }) {
  return <span className={cn("num", tone && toneClass(value), className)}>{formatPct(value, { signed })}</span>;
}

export function Qty({ value, decimals, symbol, className, trim }: { value: DecimalLike | null | undefined; decimals: number; symbol?: string; className?: string; trim?: boolean }) {
  return (
    <span className={cn("num", className)}>
      {formatQty(value, decimals, { trim })}
      {symbol && <span className="ml-1 text-muted">{symbol}</span>}
    </span>
  );
}

/** Pill showing a signed percentage change with direction arrow. */
export function ChangePill({ value, className, size = "sm" }: { value: DecimalLike | null | undefined; className?: string; size?: "sm" | "md" }) {
  const s = sign(value);
  const Icon = s >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "num inline-flex items-center gap-0.5 rounded-md font-medium",
        size === "md" ? "px-2 py-1 text-[13px]" : "px-1.5 py-0.5 text-xs",
        s > 0 ? "bg-up-soft text-up" : s < 0 ? "bg-down-soft text-down" : "bg-elevated text-muted",
        className,
      )}
    >
      {s !== 0 && <Icon className={size === "md" ? "h-3.5 w-3.5" : "h-3 w-3"} aria-hidden />}
      {formatPct(value)}
    </span>
  );
}

export function Stat({ label, value, sub, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 truncate text-[15px] font-medium text-fg">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}
