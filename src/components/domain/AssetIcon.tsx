import { getAsset } from "@shared/assets";
import { cn } from "@/lib/cn";

/** Original monogram icon (no third-party logos): asset glyph on a tinted disc. */
export function AssetIcon({ symbol, size = 28, className }: { symbol: string; size?: number; className?: string }) {
  const asset = getAsset(symbol);
  const color = symbol === "USD" ? "var(--cash)" : (asset?.color ?? "var(--muted)");
  const glyph = symbol === "USD" ? "$" : (asset?.glyph ?? symbol.slice(0, 1));
  return (
    <span
      aria-hidden
      className={cn("relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold", className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.46,
        color,
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 30%, transparent)`,
      }}
    >
      {glyph}
    </span>
  );
}

export function AssetLabel({ symbol, sub, size = 28 }: { symbol: string; sub?: string; size?: number }) {
  const asset = getAsset(symbol);
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <AssetIcon symbol={symbol} size={size} />
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium text-fg">{symbol === "USD" ? "US Dollar" : (asset?.name ?? symbol)}</span>
        <span className="block truncate text-xs text-muted">{sub ?? symbol}</span>
      </span>
    </span>
  );
}
