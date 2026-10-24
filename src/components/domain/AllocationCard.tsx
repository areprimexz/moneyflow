import { getAsset } from "@shared/assets";
import { formatUsd } from "@shared/format";
import { usePortfolio } from "@/lib/queries";
import { Card, CardHeader } from "@/components/ui/card";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Term } from "@/components/ui/tooltip";
import { AllocationBar, AllocationSwatch } from "@/components/charts/AllocationBar";

export function AllocationCard() {
  const { valuation } = usePortfolio();
  if (!valuation) {
    return (
      <Card>
        <CardHeader title="Asset allocation" />
        <SkeletonRows rows={5} />
      </Card>
    );
  }
  const slices = [
    ...valuation.positions.map((p) => ({ symbol: p.symbol, value: p.marketValue.toNumber(), share: p.allocation.toNumber(), qty: p.quantity })),
    { symbol: "USD", value: valuation.cash.toNumber(), share: valuation.cashAllocation.toNumber(), qty: valuation.cash },
  ].sort((a, b) => b.value - a.value);
  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader title={<Term k="allocation">Asset allocation</Term>} description={`${formatUsd(valuation.totalValue)} total`} />
      <div className="card-p pt-4">
        <AllocationBar slices={slices} />
        <ul className="mt-2 space-y-0.5">
          {slices.map((s) => {
            const meta = getAsset(s.symbol);
            return (
              <li key={s.symbol} className="flex items-center gap-2.5 py-1.5 text-[13px]">
                <AllocationSwatch symbol={s.symbol} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-fg">
                    {s.symbol === "USD" ? "Cash" : meta?.name} <span className="text-xs text-subtle">{s.symbol}</span>
                  </span>
                  <span className="num block truncate text-[11px] text-muted">
                    {s.symbol === "USD" ? "Spot + Vault" : `${s.qty.toDecimalPlaces(meta?.qtyDecimals ?? 4).toFixed()} ${s.symbol}`}
                  </span>
                </span>
                <span className="text-right">
                  <span className="num block text-fg">{formatUsd(s.value)}</span>
                  <span className="num block text-[11px] text-muted">{(s.share * 100).toFixed(1)}%</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}
