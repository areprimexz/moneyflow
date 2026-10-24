import { useEffect, useRef, useState } from "react";
import { AreaSeries, LineSeries, LineStyle, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { useThemeColors } from "@/lib/theme";
import { baseOptions, dedupeByTime, timeToMs, toTime, withAlpha } from "./lw";

export interface ValuePoint {
  time: number;
  value: number;
}

/**
 * Single-series area/line chart with crosshair and floating tooltip.
 * Reports the hovered point so the parent can show "value at selected point".
 */
export function ValueChart({
  points,
  height = 280,
  tone = "accent",
  format,
  onHover,
  baseline,
  variant = "area",
  timeVisible = true,
  ariaLabel,
}: {
  points: ValuePoint[];
  height?: number;
  tone?: "up" | "down" | "accent";
  format: (v: number) => string;
  onHover?: (p: ValuePoint | null) => void;
  baseline?: number | null;
  variant?: "area" | "line";
  timeVisible?: boolean;
  ariaLabel: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Area"> | ISeriesApi<"Line"> | null>(null);
  const baselineSeries = useRef<ISeriesApi<"Line"> | null>(null);
  const colors = useThemeColors();
  const [tip, setTip] = useState<{ x: number; y: number; p: ValuePoint } | null>(null);
  const formatRef = useRef(format);
  formatRef.current = format;
  const hoverRef = useRef(onHover);
  hoverRef.current = onHover;

  const color = tone === "up" ? colors.up : tone === "down" ? colors.down : colors.accent;

  useEffect(() => {
    if (!el.current) return;
    const c = createChart(el.current, baseOptions(colors, { timeVisible }));
    chart.current = c;
    const s =
      variant === "area"
        ? c.addSeries(AreaSeries, { lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerRadius: 4, priceFormat: { type: "custom", formatter: (v: number) => formatRef.current(v) } })
        : c.addSeries(LineSeries, { lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerRadius: 4, priceFormat: { type: "custom", formatter: (v: number) => formatRef.current(v) } });
    series.current = s;
    baselineSeries.current = c.addSeries(LineSeries, { lineWidth: 1, lineStyle: LineStyle.Dotted, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, color: colors.subtle });
    c.subscribeCrosshairMove((param) => {
      const data = param.seriesData.get(s) as { value?: number } | undefined;
      if (!param.point || param.time === undefined || !data || data.value === undefined) {
        setTip(null);
        hoverRef.current?.(null);
        return;
      }
      const p = { time: timeToMs(param.time), value: data.value };
      setTip({ x: param.point.x, y: param.point.y, p });
      hoverRef.current?.(p);
    });
    return () => {
      c.remove();
      chart.current = null;
      series.current = null;
    };
    // Recreate only when the series type changes; colours/data update below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, timeVisible]);

  useEffect(() => {
    chart.current?.applyOptions(baseOptions(colors, { timeVisible }));
    const s = series.current;
    if (!s) return;
    if (variant === "area") (s as ISeriesApi<"Area">).applyOptions({ lineColor: color, topColor: withAlpha(color, 0.22), bottomColor: withAlpha(color, 0.0), crosshairMarkerBackgroundColor: color, crosshairMarkerBorderColor: colors.card });
    else (s as ISeriesApi<"Line">).applyOptions({ color, crosshairMarkerBackgroundColor: color, crosshairMarkerBorderColor: colors.card });
    baselineSeries.current?.applyOptions({ color: colors.subtle });
  }, [colors, color, variant, timeVisible]);

  useEffect(() => {
    const s = series.current;
    if (!s) return;
    const data = dedupeByTime(points.filter((p) => Number.isFinite(p.value)).map((p) => ({ time: toTime(p.time), value: p.value })));
    s.setData(data);
    if (baselineSeries.current) {
      baselineSeries.current.setData(baseline != null && data.length > 1 ? [{ time: data[0]!.time, value: baseline }, { time: data[data.length - 1]!.time as UTCTimestamp, value: baseline }] : []);
    }
    chart.current?.timeScale().fitContent();
  }, [points, baseline]);

  const width = el.current?.clientWidth ?? 0;
  return (
    <div className="relative w-full" style={{ height }} role="img" aria-label={ariaLabel}>
      <div ref={el} className="absolute inset-0" />
      {tip && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-line-strong bg-raised/95 px-2.5 py-1.5 shadow-lg backdrop-blur"
          style={{ left: Math.min(Math.max(tip.x + 12, 0), Math.max(0, width - 170)), top: Math.max(4, tip.y - 52) }}
        >
          <div className="num text-[13px] font-medium text-fg">{format(tip.p.value)}</div>
          <div className="num text-[11px] text-muted">
            {new Date(tip.p.time).toLocaleString("en-US", { month: "short", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}
          </div>
        </div>
      )}
    </div>
  );
}
