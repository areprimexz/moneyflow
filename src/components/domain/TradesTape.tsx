import { requireAsset } from "@shared/assets";
import { formatPrice, formatQty, formatTime } from "@shared/format";
import { useTape } from "@/lib/queries";
import { EmptyState } from "@/components/ui/empty";
import { SkeletonRows } from "@/components/ui/skeleton";

export function TradesTape({ symbol, rows = 20 }: { symbol: string; rows?: number }) {
  const meta = requireAsset(symbol);
  const tape = useTape(symbol);
  if (!tape.data) return <SkeletonRows rows={5} />;
  if (!tape.data.available) return <EmptyState title="No trade feed" description="The live reference provider does not publish individual trades." />;
  return (
    <div className="px-[var(--card-p)] pt-2 pb-3" aria-label="Recent market trades">
      <div className="grid grid-cols-3 pb-1.5 text-[10.5px] font-medium tracking-wide text-subtle uppercase">
        <span>Price (USD)</span>
        <span className="text-right">Amount ({symbol})</span>
        <span className="text-right">Time</span>
      </div>
      <ul className="num space-y-[3px] text-xs">
        {tape.data.trades.slice(0, rows).map((t) => (
          <li key={t.id} className="grid grid-cols-3">
            <span className={t.side === "buy" ? "text-up" : "text-down"}>{formatPrice(t.price, meta.priceDecimals).replace("$", "")}</span>
            <span className="text-right text-fg">{formatQty(t.quantity, meta.qtyDecimals)}</span>
            <span className="text-right text-muted">{formatTime(t.time)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
