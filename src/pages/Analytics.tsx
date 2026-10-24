import { useState } from "react";
import { Award, RotateCcw, TrendingDown } from "lucide-react";
import { getAsset } from "@shared/assets";
import { D } from "@shared/decimal";
import { formatPct, formatUsd } from "@shared/format";
import type { PortfolioRange } from "@shared/types";
import { RANGE_LABEL } from "@/lib/perf";
import { useAnalytics, usePortfolio } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton, SkeletonRows } from "@/components/ui/skeleton";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { Term } from "@/components/ui/tooltip";
import { Money, Pct } from "@/components/ui/values";
import { HistogramChart } from "@/components/charts/HistogramChart";
import { StackedBars } from "@/components/charts/StackedBars";
import { ValueChart } from "@/components/charts/ValueChart";
import { AllocationCard } from "@/components/domain/AllocationCard";
import { AssetLabel } from "@/components/domain/AssetIcon";
import { ResetDialog } from "@/components/domain/ResetDialog";
import type { GlossaryKey } from "@/lib/glossary";

const RANGES: PortfolioRange[] = ["7D", "1M", "3M", "1Y", "ALL"];

function Kpi({ label, term, children, sub }: { label: string; term?: GlossaryKey; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Card className="card-p min-w-0">
      <p className="truncate text-xs text-muted">{term ? <Term k={term}>{label}</Term> : label}</p>
      <div className="mt-2 truncate text-[17px] font-semibold text-fg">{children}</div>
      {sub && <div className="mt-1 truncate text-xs text-muted">{sub}</div>}
    </Card>
  );
}

export default function Analytics() {
  const [range, setRange] = useState<PortfolioRange>("1M");
  const [resetOpen, setResetOpen] = useState(false);
  const q = useAnalytics(range);
  const { valuation } = usePortfolio();
  const a = q.data;
  const loading = !a;
  const best = a?.assetPerformance[0];
  const worst = a && a.assetPerformance.length > 1 ? a.assetPerformance[a.assetPerformance.length - 1] : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label="Analytics interval" value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r, label: r }))} />
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-muted sm:inline">Measured over {RANGE_LABEL[range]} · UTC days</span>
          <Button variant="outline" size="sm" onClick={() => setResetOpen(true)}>
            <RotateCcw className="h-3.5 w-3.5" /> Reset paper account
          </Button>
        </div>
      </div>

      {q.isError && !a && <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {a && !a.available && <ErrorState message={a.message ?? "Analytics are unavailable from the current data source."} onRetry={() => q.refetch()} />}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Period P/L" term="performance" sub={a ? <>excl. {formatUsd(a.totals.flows, { signed: true })} flows</> : undefined}>
          {a ? <Money value={a.totals.pnl} signed tone /> : <Skeleton className="h-5 w-20" />}
        </Kpi>
        <Kpi label="Time-weighted return" term="twr" sub={a ? `${formatUsd(a.totals.startValue)} → ${formatUsd(a.totals.endValue)}` : undefined}>
          {a ? a.totals.returnPct !== null ? <Pct value={a.totals.returnPct} /> : <span className="text-muted">—</span> : <Skeleton className="h-5 w-20" />}
        </Kpi>
        <Kpi label="Realized P/L" term="realized" sub={a ? `${a.totals.sells} sell${a.totals.sells === 1 ? "" : "s"} in period` : undefined}>
          {a ? <Money value={a.totals.realizedPnl} signed tone /> : <Skeleton className="h-5 w-20" />}
        </Kpi>
        <Kpi label="Unrealized P/L" term="unrealized" sub="Current open positions">
          {valuation ? <Money value={valuation.unrealizedPnl} signed tone /> : <Skeleton className="h-5 w-20" />}
        </Kpi>
        <Kpi label="Trading volume" sub={a ? `${a.totals.trades} trade${a.totals.trades === 1 ? "" : "s"} · ${a.totals.buys} buy${a.totals.buys === 1 ? "" : "s"}` : undefined}>
          {a ? <Money value={a.totals.tradingVolume} /> : <Skeleton className="h-5 w-20" />}
        </Kpi>
        <Kpi label="Fees paid" sub={a && D(a.totals.tradingVolume).gt(0) ? <>{formatPct(D(a.totals.feesPaid).div(a.totals.tradingVolume), { signed: false, decimals: 3 })} of volume</> : "Trading + network fees"}>
          {a ? <Money value={a.totals.feesPaid} /> : <Skeleton className="h-5 w-20" />}
        </Kpi>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader title="Portfolio value" description="Value of cash and holdings over the interval" />
          <div className="px-1 pt-3 pb-2">
            {loading ? <Skeleton className="m-3 h-[240px]" /> : a.history.length > 1 ? (
              <ValueChart points={a.history} height={240} tone={D(a.totals.pnl).isNegative() ? "down" : "up"} format={(v) => formatUsd(v)} ariaLabel="Portfolio value history" />
            ) : <EmptyState title="Not enough history" />}
          </div>
        </Card>
        <Card className="min-w-0">
          <CardHeader title={<Term k="twr">Cumulative return</Term>} description="Chained daily returns, flows excluded" />
          <div className="px-1 pt-3 pb-2">
            {loading ? <Skeleton className="m-3 h-[240px]" /> : a.cumulativeReturn.length > 2 ? (
              <ValueChart points={a.cumulativeReturn} height={240} variant="line" tone={a.cumulativeReturn[a.cumulativeReturn.length - 1]!.value < 0 ? "down" : "up"} format={(v) => formatPct(v)} baseline={0} ariaLabel="Cumulative return" />
            ) : <EmptyState title="Not enough history" description="Cumulative return needs at least one full day of history." />}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="min-w-0 xl:col-span-2">
          <CardHeader title={<Term k="dailyPnl">Daily P/L</Term>} description="Value change per UTC day minus deposits, withdrawals and adjustments" />
          <div className="px-1 pt-3 pb-2">
            {loading ? <Skeleton className="m-3 h-[220px]" /> : a.dailyPnl.length > 0 ? (
              <HistogramChart data={a.dailyPnl.map((d) => ({ time: d.time, value: d.pnl }))} format={(v) => formatUsd(v, { signed: true })} ariaLabel="Daily profit and loss" />
            ) : <EmptyState title="No daily data yet" />}
          </div>
        </Card>
        <Card className="min-w-0">
          <CardHeader title="Realized vs unrealized" description="Locked-in results versus open positions" />
          <div className="card-p space-y-4 pt-4">
            {!valuation ? <SkeletonRows rows={2} /> : (() => {
              const realized = valuation.realizedPnl.toNumber();
              const unrealized = valuation.unrealizedPnl.toNumber();
              const max = Math.max(1, Math.abs(realized), Math.abs(unrealized));
              return (
                <>
                  {[
                    { label: "Realized (all time)", v: realized, k: "realized" as const },
                    { label: "Unrealized (open)", v: unrealized, k: "unrealized" as const },
                  ].map((r) => (
                    <div key={r.label}>
                      <div className="flex items-baseline justify-between text-[13px]">
                        <Term k={r.k}>{r.label}</Term>
                        <Money value={r.v} signed tone className="font-medium" />
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-elevated">
                        <div className={`h-full rounded-full ${r.v >= 0 ? "bg-up" : "bg-down"}`} style={{ width: `${(Math.abs(r.v) / max) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                  <div className="flex items-baseline justify-between border-t border-line pt-3 text-[13px]">
                    <span className="text-muted">Combined</span>
                    <Money value={realized + unrealized} signed tone className="font-semibold" />
                  </div>
                </>
              );
            })()}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="min-w-0 xl:col-span-2">
          <CardHeader title="Trading volume" description="Gross value of buys and sells per UTC day" />
          <div className="card-p pt-3">
            {loading ? <Skeleton className="h-[200px]" /> : a.volume.some((v) => v.buy > 0 || v.sell > 0) ? <StackedBars data={a.volume} /> : <EmptyState title="No trades in this interval" description="Buys and sells you place will be charted here." />}
          </div>
        </Card>
        <Card className="min-w-0">
          <CardHeader title="Win / loss" description="Closed sells in the interval (FIFO basis)" />
          <div className="card-p pt-3">
            {loading ? <SkeletonRows rows={4} /> : a.winLoss.closedTrades === 0 ? (
              <EmptyState title="No closed trades" description="Win/loss statistics appear after you sell a position." className="py-6" />
            ) : (
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
                <div><p className="text-xs text-muted"><Term k="winRate">Win rate</Term></p><p className="mt-1 font-medium text-fg"><Pct value={a.winLoss.winRate} tone={false} signed={false} /></p></div>
                <div><p className="text-xs text-muted">Wins / losses</p><p className="num mt-1 font-medium text-fg">{a.winLoss.wins} / {a.winLoss.losses}</p></div>
                <div><p className="text-xs text-muted">Average win</p><p className="mt-1 font-medium">{a.winLoss.averageWin ? <Money value={a.winLoss.averageWin} signed tone /> : "—"}</p></div>
                <div><p className="text-xs text-muted">Average loss</p><p className="mt-1 font-medium">{a.winLoss.averageLoss ? <Money value={a.winLoss.averageLoss} signed tone /> : "—"}</p></div>
                <div><p className="text-xs text-muted">Largest win</p><p className="mt-1 font-medium">{a.winLoss.largestWin ? <Money value={a.winLoss.largestWin} signed tone /> : "—"}</p></div>
                <div><p className="text-xs text-muted"><Term k="profitFactor">Profit factor</Term></p><p className="num mt-1 font-medium text-fg">{a.winLoss.profitFactor ? D(a.winLoss.profitFactor).toFixed(2) : a.winLoss.losses === 0 ? "No losses" : "—"}</p></div>
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="min-w-0 xl:col-span-2">
          <CardHeader title="Asset performance" description="P/L per asset over the interval: end value − start value − net cash invested" />
          <div className="mt-3">
            {loading ? <SkeletonRows rows={4} /> : a.assetPerformance.length === 0 ? (
              <EmptyState title="No asset activity" description="Hold or trade assets to compare their performance." />
            ) : (
              <>
                <div className="grid gap-3 px-[var(--card-p)] pb-3 sm:grid-cols-2">
                  {best && D(best.pnl).gt(0) && (
                    <div className="rounded-lg border border-up/25 bg-up-soft p-3">
                      <p className="flex items-center gap-1.5 text-xs text-up"><Award className="h-3.5 w-3.5" /> Best performer</p>
                      <p className="mt-1 flex items-baseline justify-between text-[13px]"><span className="font-medium text-fg">{getAsset(best.symbol)?.name}</span><Money value={best.pnl} signed tone /></p>
                    </div>
                  )}
                  {worst && D(worst.pnl).lt(0) && (
                    <div className="rounded-lg border border-down/25 bg-down-soft p-3">
                      <p className="flex items-center gap-1.5 text-xs text-down"><TrendingDown className="h-3.5 w-3.5" /> Worst performer</p>
                      <p className="mt-1 flex items-baseline justify-between text-[13px]"><span className="font-medium text-fg">{getAsset(worst.symbol)?.name}</span><Money value={worst.pnl} signed tone /></p>
                    </div>
                  )}
                </div>
                <Table minWidth={720}>
                  <thead>
                    <tr>
                      <Th>Asset</Th>
                      <Th align="right">Start value</Th>
                      <Th align="right">Net invested</Th>
                      <Th align="right">End value</Th>
                      <Th align="right">Realized</Th>
                      <Th align="right">P/L</Th>
                      <Th align="right">Return</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.assetPerformance.map((p) => (
                      <Tr key={p.symbol}>
                        <Td><AssetLabel symbol={p.symbol} size={24} /></Td>
                        <Td align="right"><Money value={p.startValue} className="text-muted" /></Td>
                        <Td align="right"><Money value={p.netInvested} signed className="text-muted" /></Td>
                        <Td align="right"><Money value={p.endValue} className="text-fg" /></Td>
                        <Td align="right"><Money value={p.realizedPnl} signed tone /></Td>
                        <Td align="right"><Money value={p.pnl} signed tone className="font-medium" /></Td>
                        <Td align="right">{p.returnPct ? <Pct value={p.returnPct} /> : <span className="text-subtle">—</span>}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </>
            )}
          </div>
        </Card>
        <AllocationCard />
      </div>

      <Card>
        <CardHeader title="Monthly performance" description="Time-weighted return per calendar month (UTC)" />
        <div className="mt-3">
          {loading ? <SkeletonRows rows={3} /> : a.monthly.length === 0 ? <EmptyState title="No monthly data yet" /> : (
            <Table minWidth={560}>
              <thead>
                <tr>
                  <Th>Month</Th>
                  <Th align="right">Start value</Th>
                  <Th align="right">Net flows</Th>
                  <Th align="right">End value</Th>
                  <Th align="right">Return</Th>
                </tr>
              </thead>
              <tbody>
                {a.monthly.map((m) => (
                  <Tr key={m.month}>
                    <Td className="text-fg">{new Date(`${m.month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</Td>
                    <Td align="right"><Money value={m.startValue} className="text-muted" /></Td>
                    <Td align="right"><Money value={m.flows} signed className="text-muted" /></Td>
                    <Td align="right"><Money value={m.endValue} className="text-fg" /></Td>
                    <Td align="right">{m.returnPct !== null ? <Pct value={m.returnPct} /> : <span className="text-subtle">—</span>}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </Card>
      <ResetDialog open={resetOpen} onOpenChange={setResetOpen} />
    </div>
  );
}
