import { useNavigate } from "react-router";
import { BookOpen, PieChart } from "lucide-react";
import { getAsset, pairSlug } from "@shared/assets";
import { D } from "@shared/decimal";
import { formatUsd } from "@shared/format";
import { usePortfolio, usePreferences } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Skeleton, SkeletonRows } from "@/components/ui/skeleton";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { Term } from "@/components/ui/tooltip";
import { Money, Pct } from "@/components/ui/values";
import { AllocationCard } from "@/components/domain/AllocationCard";
import { AssetLabel } from "@/components/domain/AssetIcon";
import { HoldingsTable } from "@/components/domain/HoldingsTable";
import { PortfolioChartCard } from "@/components/domain/PortfolioChartCard";
import type { GlossaryKey } from "@/lib/glossary";

function Summary({ label, term, children, sub }: { label: string; term?: GlossaryKey; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0 bg-card px-4 py-3.5">
      <p className="truncate text-xs text-muted">{term ? <Term k={term}>{label}</Term> : label}</p>
      <div className="mt-1.5 truncate text-[17px] font-semibold text-fg">{children}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-muted">{sub}</div>}
    </div>
  );
}

export default function Portfolio() {
  const { valuation, account, error } = usePortfolio();
  const prefs = usePreferences();
  const navigate = useNavigate();
  if (error && !valuation) return <ErrorState message={(error as Error).message} />;
  const closed = (account?.positions ?? []).filter((p) => D(p.quantity).isZero());

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-line sm:grid-cols-3 xl:grid-cols-6">
          <Summary label="Total value" term="portfolioValue">{valuation ? <Money value={valuation.totalValue} /> : <Skeleton className="h-5 w-24" />}</Summary>
          <Summary label="Cash" sub={valuation ? `Spot ${formatUsd(valuation.cashSpot)} · Vault ${formatUsd(valuation.cashVault)}` : undefined}>
            {valuation ? <Money value={valuation.cash} /> : <Skeleton className="h-5 w-24" />}
          </Summary>
          <Summary label="Holdings value">{valuation ? <Money value={valuation.holdingsValue} /> : <Skeleton className="h-5 w-24" />}</Summary>
          <Summary label="Cost basis" term="costBasis">{valuation ? <Money value={valuation.costBasis} /> : <Skeleton className="h-5 w-24" />}</Summary>
          <Summary label="Unrealized P/L" term="unrealized" sub={valuation && valuation.costBasis.gt(0) ? <Pct value={valuation.unrealizedPnl.div(valuation.costBasis)} /> : undefined}>
            {valuation ? <Money value={valuation.unrealizedPnl} signed tone /> : <Skeleton className="h-5 w-24" />}
          </Summary>
          <Summary label="Realized P/L" term="realized" sub={account ? `${formatUsd(account.totals.feesPaid)} fees paid` : undefined}>
            {valuation ? <Money value={valuation.realizedPnl} signed tone /> : <Skeleton className="h-5 w-24" />}
          </Summary>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <PortfolioChartCard height={280} />
        </div>
        <AllocationCard />
      </div>

      <Card>
        <CardHeader
          title="Holdings"
          description="Select a position for lots and history"
          icon={<PieChart className="h-4 w-4" />}
          actions={
            <span className="flex items-center gap-1.5 text-[11px] text-subtle">
              <BookOpen className="h-3.5 w-3.5" /> FIFO cost basis · fees capitalised
            </span>
          }
        />
        <div className="mt-3">
          {!valuation ? (
            <SkeletonRows rows={5} />
          ) : valuation.positions.length === 0 ? (
            <EmptyState
              title="No open positions"
              description="Assets you buy or deposit appear here with cost basis and P/L."
              action={<Button variant="primary" onClick={() => navigate(`/trade/${pairSlug(prefs.defaultMarket)}`)}>Open trade terminal</Button>}
            />
          ) : (
            <HoldingsTable positions={valuation.positions} detailed />
          )}
        </div>
      </Card>

      {closed.length > 0 && (
        <Card>
          <CardHeader title="Closed positions" description="Fully sold assets with realized results" />
          <div className="mt-3">
            <Table minWidth={520}>
              <thead>
                <tr>
                  <Th>Asset</Th>
                  <Th>First acquired</Th>
                  <Th align="right">Realized P/L</Th>
                </tr>
              </thead>
              <tbody>
                {closed.map((p) => (
                  <Tr key={p.symbol} onClick={() => navigate(`/portfolio/${p.symbol}`)}>
                    <Td><AssetLabel symbol={p.symbol} sub={getAsset(p.symbol)?.symbol} /></Td>
                    <Td className="num text-muted">{p.firstAcquiredAt ? new Date(p.firstAcquiredAt).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }) : "—"}</Td>
                    <Td align="right"><Money value={p.realizedPnl} signed tone /></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
