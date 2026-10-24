import { useMemo, useState } from "react";
import { D } from "@shared/decimal";
import { formatDateTime, formatPct, formatUsd } from "@shared/format";
import { PORTFOLIO_RANGES, type PortfolioRange } from "@shared/types";
import { periodPerformance, RANGE_LABEL } from "@/lib/perf";
import { useHistory, usePortfolio, usePreferences, useUpdatePreferences } from "@/lib/queries";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/empty";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { Term } from "@/components/ui/tooltip";
import { ChangePill } from "@/components/ui/values";
import { ValueChart, type ValuePoint } from "@/components/charts/ValueChart";

/** Portfolio value over time with selectable interval, hover readout and interval performance. */
export function PortfolioChartCard({ height = 300 }: { height?: number }) {
  const prefs = usePreferences();
  const updatePrefs = useUpdatePreferences();
  const [range, setRange] = useState<PortfolioRange>(prefs.portfolioRange);
  const history = useHistory(range);
  const { valuation } = usePortfolio();
  const [hover, setHover] = useState<ValuePoint | null>(null);

  const points = useMemo<ValuePoint[]>(() => {
    const pts = (history.data?.points ?? []).map((p) => ({ time: p.time, value: p.value }));
    // End the series at the live value so the chart always agrees with the headline figure.
    if (valuation && pts.length) {
      const now = Date.now();
      const last = pts[pts.length - 1]!;
      if (now - last.time >= 1000) pts.push({ time: now, value: valuation.totalValue.toNumber() });
      else pts[pts.length - 1] = { time: last.time, value: valuation.totalValue.toNumber() };
    }
    return pts;
  }, [history.data, valuation]);

  const perf = periodPerformance(history.data, valuation?.totalValue);
  const startValue = history.data ? Number(history.data.startValue) : null;
  const hoverChange = hover && startValue ? (hover.value - startValue) / startValue : null;
  const tone = perf ? (perf.pnl.isNegative() ? "down" : "up") : "accent";

  return (
    <Card className="flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3 px-[var(--card-p)] pt-[var(--card-p)]">
        <div className="min-w-0">
          <p className="text-xs text-muted">
            <Term k="performance">Performance</Term> · {RANGE_LABEL[range]}
          </p>
          {hover ? (
            <div className="mt-1.5">
              <div className="num text-xl font-semibold text-fg">{formatUsd(hover.value)}</div>
              <div className="num mt-0.5 flex items-center gap-2 text-xs text-muted">
                {formatDateTime(hover.time)}
                {hoverChange !== null && <span className={hoverChange >= 0 ? "text-up" : "text-down"}>{formatPct(hoverChange)}</span>}
              </div>
            </div>
          ) : perf ? (
            <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
              <span className={`num text-xl font-semibold ${perf.pnl.isNegative() ? "text-down" : perf.pnl.isZero() ? "text-fg" : "text-up"}`}>{formatUsd(perf.pnl, { signed: true })}</span>
              {perf.pct && <ChangePill value={perf.pct} />}
              {!perf.flows.isZero() && <span className="text-[11px] text-subtle">excl. {formatUsd(perf.flows, { signed: true })} net flows</span>}
            </div>
          ) : (
            <Skeleton className="mt-2 h-7 w-40" />
          )}
        </div>
        <Segmented
          label="Chart interval"
          value={range}
          onChange={(r) => {
            setRange(r);
            updatePrefs.mutate({ portfolioRange: r });
          }}
          options={PORTFOLIO_RANGES.map((r) => ({ value: r, label: r }))}
          size="xs"
        />
      </div>
      <div className="mt-3 px-1 pb-2">
        {history.isError ? (
          <ErrorState message={(history.error as Error).message} onRetry={() => history.refetch()} />
        ) : history.data && !history.data.available ? (
          <ErrorState message={history.data.message ?? "History is unavailable from the current data source."} onRetry={() => history.refetch()} />
        ) : points.length < 2 ? (
          <Skeleton className="mx-3 rounded-lg" />
        ) : (
          <ValueChart
            points={points}
            height={height}
            tone={tone}
            format={(v) => formatUsd(v)}
            onHover={setHover}
            baseline={startValue}
            ariaLabel={`Portfolio value over ${RANGE_LABEL[range]}`}
          />
        )}
        {!history.data && !history.isError && <Skeleton className="mx-3 rounded-lg" />}
      </div>
      {history.data && D(history.data.startValue).isZero() && points.length > 0 && (
        <p className="px-[var(--card-p)] pb-3 text-xs text-subtle">The account had no value at the start of this interval.</p>
      )}
    </Card>
  );
}
