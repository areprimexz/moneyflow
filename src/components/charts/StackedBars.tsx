import { useMemo, useState } from "react";
import { formatUsd } from "@shared/format";

/** Daily buy/sell volume as stacked bars (SVG) with per-bar hover. */
export function StackedBars({ data, height = 200 }: { data: { time: number; buy: number; sell: number }[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = useMemo(() => Math.max(1, ...data.map((d) => d.buy + d.sell)), [data]);
  const W = 1000;
  const H = height;
  const pad = { top: 8, bottom: 22 };
  const n = data.length;
  const slot = n ? W / n : W;
  const barW = Math.max(2, Math.min(28, slot - 4));
  const scale = (v: number) => (v / max) * (H - pad.top - pad.bottom);
  const h = hover !== null ? data[hover] : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full" style={{ height }} role="img" aria-label="Daily trading volume, buys and sells">
        <line x1="0" x2={W} y1={H - pad.bottom} y2={H - pad.bottom} stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {data.map((d, i) => {
          const x = i * slot + (slot - barW) / 2;
          const hb = scale(d.buy);
          const hs = scale(d.sell);
          const base = H - pad.bottom;
          const gap = hb > 0 && hs > 0 ? 2 : 0;
          return (
            <g key={d.time} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} opacity={hover !== null && hover !== i ? 0.5 : 1}>
              <rect x={i * slot} y={0} width={slot} height={H} fill="transparent" />
              {hb > 0 && <rect x={x} y={base - hb} width={barW} height={hb} rx={hs > 0 ? 0 : 2} fill="var(--up)" />}
              {hs > 0 && <rect x={x} y={base - hb - gap - hs} width={barW} height={hs} rx={2} fill="var(--down)" />}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-up" />Buys</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-down" />Sells</span>
        </span>
        {h ? (
          <span className="num">
            {new Date(h.time).toLocaleDateString("en-US", { month: "short", day: "2-digit", timeZone: "UTC" })} · Buys {formatUsd(h.buy)} · Sells {formatUsd(h.sell)}
          </span>
        ) : (
          <span>Peak day {formatUsd(max)}</span>
        )}
      </div>
    </div>
  );
}
