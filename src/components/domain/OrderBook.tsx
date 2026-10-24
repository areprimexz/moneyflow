import { requireAsset } from "@shared/assets";
import { formatPrice, formatQty } from "@shared/format";
import type { DepthLevel } from "@shared/market/controlled";
import { useDepth, useQuote } from "@/lib/queries";
import { cn } from "@/lib/cn";
import { EmptyState } from "@/components/ui/empty";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Term } from "@/components/ui/tooltip";

function Rows({ levels, side, max, decimals, qtyDecimals, onPick }: { levels: DepthLevel[]; side: "bid" | "ask"; max: number; decimals: number; qtyDecimals: number; onPick?: (price: string) => void }) {
  return (
    <ul className="num text-xs">
      {levels.map((l) => (
        <li key={l.price}>
          <button
            type="button"
            onClick={() => onPick?.(l.price)}
            className="relative grid w-full grid-cols-3 px-3 py-[3px] text-left hover:bg-hover"
            aria-label={`${side === "bid" ? "Bid" : "Ask"} ${l.price}, use as limit price`}
          >
            <span
              className={cn("absolute inset-y-0 right-0", side === "bid" ? "bg-up-soft" : "bg-down-soft")}
              style={{ width: `${Math.min(100, (Number(l.total) / max) * 100)}%` }}
              aria-hidden
            />
            <span className={cn("relative", side === "bid" ? "text-up" : "text-down")}>{formatPrice(l.price, decimals).replace("$", "")}</span>
            <span className="relative text-right text-fg">{formatQty(l.quantity, qtyDecimals)}</span>
            <span className="relative text-right text-muted">{formatQty(l.total, qtyDecimals)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Order-book-style depth ladder (simulated in Controlled mode; absent for live reference prices). */
export function OrderBook({ symbol, onPickPrice, levels = 10 }: { symbol: string; onPickPrice?: (price: string) => void; levels?: number }) {
  const meta = requireAsset(symbol);
  const depth = useDepth(symbol);
  const quote = useQuote(symbol);
  if (!depth.data) return <SkeletonRows rows={8} />;
  if (!depth.data.available) return <EmptyState title="Depth not available" description="Live reference prices do not include order-book depth." />;
  const asks = depth.data.asks.slice(0, levels);
  const bids = depth.data.bids.slice(0, levels);
  const max = Math.max(Number(asks[asks.length - 1]?.total ?? 1), Number(bids[bids.length - 1]?.total ?? 1));
  const up = quote ? Number(quote.change24h) >= 0 : true;
  return (
    <div className="pb-2" aria-label={`${symbol}/USD order book`}>
      <div className="grid grid-cols-3 px-3 pt-1 pb-1.5 text-[10.5px] font-medium tracking-wide text-subtle uppercase">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>
      <Rows levels={[...asks].reverse()} side="ask" max={max} decimals={meta.priceDecimals} qtyDecimals={meta.qtyDecimals} onPick={onPickPrice} />
      <div className="my-1 flex items-center justify-between border-y border-line bg-elevated/60 px-3 py-1.5">
        <span className={cn("num text-[15px] font-semibold", up ? "text-up" : "text-down")}>{quote ? formatPrice(quote.price, meta.priceDecimals) : "—"}</span>
        <span className="num text-[11px] text-muted">
          <Term k="spread">Spread</Term> {depth.data.spread ? formatPrice(depth.data.spread, meta.priceDecimals) : "—"}
        </span>
      </div>
      <Rows levels={bids} side="bid" max={max} decimals={meta.priceDecimals} qtyDecimals={meta.qtyDecimals} onPick={onPickPrice} />
      <p className="px-3 pt-2 text-[10.5px] text-subtle">Click a level to set a limit price</p>
    </div>
  );
}
