import { Link } from "react-router";
import { formatRelative } from "@shared/format";
import { useQuotes } from "@/lib/queries";
import { useNow } from "@/lib/useNow";
import { cn } from "@/lib/cn";
import { Tooltip } from "@/components/ui/tooltip";

/** Honest market-data status: which source is active and how fresh it is. */
export function MarketStatus({ compact }: { compact?: boolean }) {
  const { data, isError } = useQuotes();
  const now = useNow(5000);
  if (!data) {
    return (
      <span className="inline-flex h-8 items-center gap-2 rounded-lg border border-line px-2.5 text-xs text-muted">
        <span className={cn("h-1.5 w-1.5 rounded-full", isError ? "bg-down" : "bg-subtle")} />
        {isError ? "Offline" : "Connecting"}
      </span>
    );
  }
  // Neutral label for the built-in engine; "Live Prices" only while live data is actually flowing.
  let tone = "bg-accent";
  let label = "Market Data";
  let detail = data.speed === 0 ? "Paused" : "";
  if (data.mode === "live") {
    if (data.status === "ok") {
      tone = "bg-up";
      label = "Live Prices";
      detail = data.lastSuccessAt ? formatRelative(data.lastSuccessAt, now) : "";
    } else if (data.status === "degraded") {
      tone = "bg-warn";
      label = "Prices stale";
      detail = data.lastSuccessAt ? formatRelative(data.lastSuccessAt, now) : "";
    } else {
      tone = "bg-down";
      label = "Live unavailable";
      detail = "fallback";
    }
  }
  const tip =
    data.mode === "controlled"
      ? "Prices from the built-in market data engine. Configure prices, volatility and movement in Settings → Market data."
      : (data.message ?? `Live reference prices from the configured provider. Last successful update ${data.lastSuccessAt ? new Date(data.lastSuccessAt).toLocaleTimeString() : "never"}.`);
  return (
    <Tooltip content={tip} side="bottom">
      <Link to="/settings#market" className="inline-flex h-8 items-center gap-2 rounded-lg border border-line px-2.5 text-xs text-muted transition-colors hover:border-line-strong hover:text-fg">
        <span className="relative flex h-1.5 w-1.5">
          {data.status === "ok" && data.speed !== 0 && <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-50", tone)} />}
          <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", tone)} />
        </span>
        <span className="font-medium text-fg">{label}</span>
        {!compact && detail && <span className="hidden xl:inline">{detail}</span>}
      </Link>
    </Tooltip>
  );
}
