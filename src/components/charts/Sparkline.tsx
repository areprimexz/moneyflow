import { useId } from "react";

export function Sparkline({ values, width = 96, height = 28, tone }: { values: number[]; width?: number; height?: number; tone: "up" | "down" | "muted" }) {
  const id = useId();
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < 2) return <span className="inline-block" style={{ width, height }} aria-hidden />;
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  // Keep at least a 1% band so near-flat series (stablecoins) are not exaggerated into noise.
  const mean = (max + min) / 2;
  const span = Math.max(max - min, Math.abs(mean) * 0.01) || 1;
  const lo = mean - span / 2 < min ? mean - span / 2 : min;
  const pts = clean.map((v, i) => [(i / (clean.length - 1)) * width, height - 2 - ((v - lo) / span) * (height - 4)] as const);
  const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const color = tone === "up" ? "var(--up)" : tone === "down" ? "var(--down)" : "var(--muted)";
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="block overflow-visible">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${width},${height} L0,${height} Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
