import { ColorType, CrosshairMode, LineStyle, type DeepPartial, type ChartOptions, type Time, type UTCTimestamp } from "lightweight-charts";
import type { ThemeColors } from "@/lib/theme";

const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
const dayFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const monthFmt = new Intl.DateTimeFormat("en-US", { month: "short" });
const yearFmt = new Intl.DateTimeFormat("en-US", { year: "numeric" });
const fullFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

export function toTime(ms: number): UTCTimestamp {
  return Math.floor(ms / 1000) as UTCTimestamp;
}

export function timeToMs(t: Time): number {
  return typeof t === "number" ? t * 1000 : typeof t === "string" ? Date.parse(t) : Date.UTC(t.year, t.month - 1, t.day);
}

/** Chart options shared by every lightweight-chart, rendered in local time. */
export function baseOptions(c: ThemeColors, opts: { timeVisible?: boolean; secondsVisible?: boolean } = {}): DeepPartial<ChartOptions> {
  return {
    autoSize: true,
    layout: {
      background: { type: ColorType.Solid, color: "transparent" },
      textColor: c.muted,
      fontFamily: '"Geist Mono Variable", ui-monospace, monospace',
      fontSize: 11,
    },
    grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
    rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.08 } },
    timeScale: {
      borderVisible: false,
      timeVisible: opts.timeVisible ?? true,
      secondsVisible: opts.secondsVisible ?? false,
      fixLeftEdge: true,
      fixRightEdge: true,
      lockVisibleTimeRangeOnResize: true,
      tickMarkFormatter: (time: Time, tickType: number) => {
        const d = new Date(timeToMs(time));
        // 0 year, 1 month, 2 day of month, 3 time, 4 time with seconds
        if (tickType === 0) return yearFmt.format(d);
        if (tickType === 1) return monthFmt.format(d);
        if (tickType === 2) return dayFmt.format(d);
        return timeFmt.format(d);
      },
    },
    localization: { timeFormatter: (time: Time) => fullFmt.format(new Date(timeToMs(time))) },
    crosshair: {
      mode: CrosshairMode.Magnet,
      vertLine: { color: c.subtle, width: 1, style: LineStyle.Dashed, labelBackgroundColor: c.border },
      horzLine: { color: c.subtle, width: 1, style: LineStyle.Dashed, labelBackgroundColor: c.border },
    },
    handleScale: { axisPressedMouseMove: { time: true, price: false } },
  };
}

/** Lightweight-charts rejects duplicate or unsorted times; keep the last point per second. */
export function dedupeByTime<T extends { time: UTCTimestamp }>(points: T[]): T[] {
  const out: T[] = [];
  for (const p of points) {
    if (out.length && out[out.length - 1]!.time >= p.time) {
      if (out[out.length - 1]!.time === p.time) out[out.length - 1] = p;
      continue;
    }
    out.push(p);
  }
  return out;
}

export function withAlpha(color: string, alpha: number): string {
  if (color.startsWith("#") && color.length === 7) {
    const a = Math.round(alpha * 255)
      .toString(16)
      .padStart(2, "0");
    return `${color}${a}`;
  }
  return color;
}
