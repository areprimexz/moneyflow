import { useState } from "react";
import { BarChart2, CandlestickChart, LineChart } from "lucide-react";
import { requireAsset } from "@shared/assets";
import { CANDLE_INTERVALS, type CandleInterval } from "@shared/market/controlled";
import { usePreferences, useQuote, useSettings, useCandles, useUpdatePreferences } from "@/lib/queries";
import { cn } from "@/lib/cn";
import { ErrorState } from "@/components/ui/empty";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { CandleChart, type PriceLineSpec } from "@/components/charts/CandleChart";

const ALL: CandleInterval[] = ["1m", "5m", "15m", "1h", "4h", "1D", "1W"];

export function MarketChartPanel({ symbol, height = 420, priceLines, className }: { symbol: string; height?: number | string; priceLines?: PriceLineSpec[]; className?: string }) {
  const meta = requireAsset(symbol);
  const prefs = usePreferences();
  const updatePrefs = useUpdatePreferences();
  const settings = useSettings();
  const enabled = settings.data?.market.chartIntervals ?? ALL;
  const [interval, setInterval] = useState<CandleInterval>(enabled.includes(prefs.defaultInterval) ? prefs.defaultInterval : (enabled[0] ?? "1h"));
  const active = enabled.includes(interval) ? interval : (enabled[0] ?? "1h");
  const candles = useCandles(symbol, active);
  const quote = useQuote(symbol);
  const type = prefs.chartType;
  const showVolume = prefs.showVolume;

  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-3">
        <Segmented label="Chart interval" value={active} onChange={setInterval} options={ALL.filter((i) => enabled.includes(i)).map((i) => ({ value: i, label: i }))} size="xs" />
        <div className="flex items-center gap-1">
          <Tooltip content={type === "candles" ? "Show line chart" : "Show candlesticks"}>
            <button
              onClick={() => updatePrefs.mutate({ chartType: type === "candles" ? "line" : "candles" })}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg"
              aria-label={type === "candles" ? "Switch to line chart" : "Switch to candlestick chart"}
            >
              {type === "candles" ? <LineChart className="h-4 w-4" /> : <CandlestickChart className="h-4 w-4" />}
            </button>
          </Tooltip>
          <Tooltip content={showVolume ? "Hide volume" : "Show volume"}>
            <button
              onClick={() => updatePrefs.mutate({ showVolume: !showVolume })}
              className={cn("flex h-7 w-7 items-center justify-center rounded-md hover:bg-hover hover:text-fg", showVolume ? "text-fg" : "text-muted")}
              aria-label={showVolume ? "Hide volume" : "Show volume"}
              aria-pressed={showVolume}
            >
              <BarChart2 className="h-4 w-4" />
            </button>
          </Tooltip>
        </div>
      </div>
      <div className="relative min-h-0 flex-1 px-1 pt-1 pb-1">
        {candles.isError ? (
          <ErrorState message={(candles.error as Error).message} onRetry={() => candles.refetch()} />
        ) : candles.data && !candles.data.available ? (
          <ErrorState message={candles.data.message ?? "Chart data unavailable."} onRetry={() => candles.refetch()} />
        ) : !candles.data ? (
          <Skeleton className="m-2 rounded-lg" />
        ) : (
          <CandleChart
            key={`${symbol}`}
            candles={candles.data.candles}
            type={type}
            showVolume={showVolume}
            priceDecimals={meta.priceDecimals}
            livePrice={quote ? Number(quote.price) : null}
            priceLines={priceLines}
            height={height}
            intervalMs={CANDLE_INTERVALS[active]}
            ariaLabel={`${meta.name} ${active} price chart`}
          />
        )}
        {candles.data?.message && candles.data.available && <p className="px-3 text-[11px] text-subtle">{candles.data.message}</p>}
      </div>
    </div>
  );
}
