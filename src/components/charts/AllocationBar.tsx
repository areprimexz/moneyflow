import { useState } from "react";
import { getAsset } from "@shared/assets";
import { formatPct, formatUsd } from "@shared/format";
import { allocationColor, hasOwnAllocationColor, useThemeColors } from "@/lib/theme";
import { cn } from "@/lib/cn";

export interface AllocationSlice {
  symbol: string;
  value: number;
  share: number;
}

/**
 * Part-to-whole as a single stacked bar (2px gaps between segments) with a per-segment
 * hover readout. Identity is always also carried by the labelled list next to it.
 */
export function AllocationBar({ slices, height = 14, className }: { slices: AllocationSlice[]; height?: number; className?: string }) {
  const { theme } = useThemeColors();
  const [hover, setHover] = useState<AllocationSlice | null>(null);
  const visible = slices.filter((s) => s.share > 0);
  return (
    <div className={cn("relative", className)}>
      <div className="flex w-full gap-[2px] overflow-hidden rounded-[5px]" style={{ height }} role="img" aria-label={`Allocation: ${visible.map((s) => `${s.symbol === "USD" ? "Cash" : s.symbol} ${formatPct(s.share, { signed: false })}`).join(", ")}`}>
        {visible.map((s) => (
          <div
            key={s.symbol}
            className="h-full min-w-[3px] transition-opacity first:rounded-l-[4px] last:rounded-r-[4px]"
            style={{ flexGrow: s.share, flexBasis: 0, background: allocationColor(s.symbol, theme), opacity: hover && hover.symbol !== s.symbol ? 0.45 : 1 }}
            onMouseEnter={() => setHover(s)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </div>
      <div className="mt-2 h-4 text-xs text-muted" aria-live="polite">
        {hover ? (
          <span>
            <span className="text-fg">{hover.symbol === "USD" ? "Cash" : (getAsset(hover.symbol)?.name ?? hover.symbol)}</span>
            <span className="num"> · {formatUsd(hover.value)} · {formatPct(hover.share, { signed: false })}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function AllocationSwatch({ symbol }: { symbol: string }) {
  const { theme } = useThemeColors();
  return (
    <span
      aria-hidden
      className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]", !hasOwnAllocationColor(symbol) && "ring-1 ring-line-strong")}
      style={{ background: allocationColor(symbol, theme) }}
    />
  );
}
