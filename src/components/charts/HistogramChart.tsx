import { useEffect, useRef, useState } from "react";
import { HistogramSeries, createChart, type IChartApi, type ISeriesApi } from "lightweight-charts";
import { useThemeColors } from "@/lib/theme";
import { baseOptions, dedupeByTime, timeToMs, toTime } from "./lw";

/** Diverging bars (gain/loss polarity) with a hover readout. */
export function HistogramChart({ data, height = 220, format, ariaLabel, dateOnly = true }: { data: { time: number; value: number }[]; height?: number; format: (v: number) => string; ariaLabel: string; dateOnly?: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Histogram"> | null>(null);
  const colors = useThemeColors();
  const [tip, setTip] = useState<{ x: number; time: number; value: number } | null>(null);
  const formatRef = useRef(format);
  formatRef.current = format;

  useEffect(() => {
    if (!el.current) return;
    const c = createChart(el.current, baseOptions(colors, { timeVisible: !dateOnly }));
    chart.current = c;
    series.current = c.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false, priceFormat: { type: "custom", formatter: (v: number) => formatRef.current(v) } });
    c.subscribeCrosshairMove((param) => {
      const d = series.current ? (param.seriesData.get(series.current) as { value?: number } | undefined) : undefined;
      if (!param.point || param.time === undefined || d?.value === undefined) return setTip(null);
      setTip({ x: param.point.x, time: timeToMs(param.time), value: d.value });
    });
    return () => {
      c.remove();
      chart.current = null;
      series.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateOnly]);

  useEffect(() => {
    chart.current?.applyOptions(baseOptions(colors, { timeVisible: !dateOnly }));
    series.current?.setData(dedupeByTime(data.map((d) => ({ time: toTime(d.time), value: d.value, color: d.value >= 0 ? colors.up : colors.down }))));
    chart.current?.timeScale().fitContent();
  }, [data, colors, dateOnly]);

  const width = el.current?.clientWidth ?? 0;
  return (
    <div className="relative w-full" style={{ height }} role="img" aria-label={ariaLabel}>
      <div ref={el} className="absolute inset-0" />
      {tip && (
        <div className="pointer-events-none absolute top-2 z-10 rounded-lg border border-line-strong bg-raised/95 px-2.5 py-1.5 shadow-lg" style={{ left: Math.min(Math.max(tip.x + 12, 0), Math.max(0, width - 150)) }}>
          <div className={`num text-[13px] font-medium ${tip.value >= 0 ? "text-up" : "text-down"}`}>{format(tip.value)}</div>
          <div className="num text-[11px] text-muted">{new Date(tip.time).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric", timeZone: dateOnly ? "UTC" : undefined })}</div>
        </div>
      )}
    </div>
  );
}
