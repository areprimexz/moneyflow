import { useEffect, useRef, useState } from "react";
import { CandlestickSeries, HistogramSeries, LineSeries, LineStyle, createChart, type IChartApi, type IPriceLine, type ISeriesApi } from "lightweight-charts";
import type { Candle } from "@shared/market/controlled";
import { formatCompactUsd, formatNumber, formatPrice } from "@shared/format";
import { useThemeColors } from "@/lib/theme";
import { baseOptions, timeToMs, toTime, withAlpha } from "./lw";

export interface PriceLineSpec {
  price: number;
  title: string;
  tone: "up" | "down" | "accent" | "muted";
}

interface Hover {
  candle: Candle;
}

export function CandleChart({
  candles,
  type = "candles",
  showVolume = true,
  priceDecimals,
  livePrice,
  priceLines = [],
  height = 420,
  intervalMs,
  ariaLabel,
}: {
  candles: Candle[];
  type?: "candles" | "line";
  showVolume?: boolean;
  priceDecimals: number;
  livePrice?: number | null;
  priceLines?: PriceLineSpec[];
  height?: number | string;
  intervalMs: number;
  ariaLabel: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const main = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | null>(null);
  const vol = useRef<ISeriesApi<"Histogram"> | null>(null);
  const lines = useRef<IPriceLine[]>([]);
  const last = useRef<Candle | null>(null);
  const fitted = useRef<string>("");
  const colors = useThemeColors();
  const [hover, setHover] = useState<Hover | null>(null);
  const byTime = useRef(new Map<number, Candle>());

  useEffect(() => {
    if (!el.current) return;
    const c = createChart(el.current, { ...baseOptions(colors), rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: showVolume ? 0.24 : 0.06 } } });
    chart.current = c;
    const minMove = 1 / 10 ** priceDecimals;
    const priceFormat = { type: "custom" as const, minMove, formatter: (v: number) => formatNumber(v, priceDecimals) };
    main.current =
      type === "candles"
        ? c.addSeries(CandlestickSeries, { priceFormat, borderVisible: false })
        : c.addSeries(LineSeries, { lineWidth: 2, priceFormat });
    if (showVolume) {
      vol.current = c.addSeries(HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
      c.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    }
    c.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) return setHover(null);
      const candle = byTime.current.get(timeToMs(param.time));
      setHover(candle ? { candle } : null);
    });
    fitted.current = "";
    return () => {
      c.remove();
      chart.current = null;
      main.current = null;
      vol.current = null;
      lines.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, showVolume, priceDecimals]);

  useEffect(() => {
    chart.current?.applyOptions(baseOptions(colors));
    const m = main.current;
    if (!m) return;
    if (type === "candles") (m as ISeriesApi<"Candlestick">).applyOptions({ upColor: colors.up, downColor: colors.down, wickUpColor: colors.up, wickDownColor: colors.down });
    else (m as ISeriesApi<"Line">).applyOptions({ color: colors.accent });
  }, [colors, type]);

  useEffect(() => {
    const m = main.current;
    if (!m) return;
    byTime.current = new Map(candles.map((c) => [c.time, c]));
    if (type === "candles") (m as ISeriesApi<"Candlestick">).setData(candles.map((c) => ({ time: toTime(c.time), open: c.open, high: c.high, low: c.low, close: c.close })));
    else (m as ISeriesApi<"Line">).setData(candles.map((c) => ({ time: toTime(c.time), value: c.close })));
    vol.current?.setData(candles.map((c) => ({ time: toTime(c.time), value: c.volume, color: withAlpha(c.close >= c.open ? colors.up : colors.down, 0.35) })));
    last.current = candles.length ? { ...candles[candles.length - 1]! } : null;
    // Fit once per interval/type so user zoom survives periodic refreshes.
    const viewKey = `${intervalMs}:${type}`;
    if (candles.length && fitted.current !== viewKey) {
      chart.current?.timeScale().fitContent();
      fitted.current = viewKey;
    }
  }, [candles, colors, type, intervalMs]);

  // Stream the shared quote into the last candle so the chart matches the ticker.
  useEffect(() => {
    const m = main.current;
    const l = last.current;
    if (!m || !l || livePrice == null || !Number.isFinite(livePrice)) return;
    const now = Date.now();
    if (now >= l.time + intervalMs) return; // a new candle will arrive with the next refresh
    l.close = livePrice;
    l.high = Math.max(l.high, livePrice);
    l.low = Math.min(l.low, livePrice);
    if (type === "candles") (m as ISeriesApi<"Candlestick">).update({ time: toTime(l.time), open: l.open, high: l.high, low: l.low, close: l.close });
    else (m as ISeriesApi<"Line">).update({ time: toTime(l.time), value: l.close });
    byTime.current.set(l.time, { ...l });
  }, [livePrice, intervalMs, type]);

  useEffect(() => {
    const m = main.current;
    if (!m) return;
    for (const pl of lines.current) m.removePriceLine(pl);
    lines.current = priceLines.map((p) =>
      m.createPriceLine({
        price: p.price,
        title: p.title,
        color: p.tone === "up" ? colors.up : p.tone === "down" ? colors.down : p.tone === "accent" ? colors.accent : colors.muted,
        lineStyle: LineStyle.Dashed,
        lineWidth: 1,
        axisLabelVisible: true,
      }),
    );
  }, [priceLines, colors, type, showVolume, priceDecimals]);

  const h = hover?.candle;
  return (
    <div className="relative w-full" style={{ height }} role="img" aria-label={ariaLabel}>
      <div ref={el} className="absolute inset-0" />
      <div className="pointer-events-none absolute top-1 left-2 z-10 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] num text-muted">
        {h ? (
          <>
            <span>O <span className="text-fg">{formatPrice(h.open, priceDecimals)}</span></span>
            <span>H <span className="text-fg">{formatPrice(h.high, priceDecimals)}</span></span>
            <span>L <span className="text-fg">{formatPrice(h.low, priceDecimals)}</span></span>
            <span>C <span className={h.close >= h.open ? "text-up" : "text-down"}>{formatPrice(h.close, priceDecimals)}</span></span>
            {showVolume && <span>Vol <span className="text-fg">{formatCompactUsd(h.volume)}</span></span>}
          </>
        ) : null}
      </div>
    </div>
  );
}
