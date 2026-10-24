import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowDownLeft, ArrowLeftRight, Briefcase, Clock, Sparkles, Star, Wallet } from "lucide-react";
import { getAsset, pairSlug } from "@shared/assets";
import { D } from "@shared/decimal";
import { formatPrice, formatUsd } from "@shared/format";
import { PORTFOLIO_RANGES, type PortfolioRange } from "@shared/types";
import { periodPerformance, RANGE_LABEL } from "@/lib/perf";
import { useHistory, usePortfolio, usePreferences, useQuotes, useTransactions, useUpdatePreferences, useWatchlist } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Select } from "@/components/ui/form";
import { Skeleton, SkeletonRows } from "@/components/ui/skeleton";
import { Term } from "@/components/ui/tooltip";
import { ChangePill, Money, Pct } from "@/components/ui/values";
import { ActivityList } from "@/components/domain/ActivityList";
import { AllocationCard } from "@/components/domain/AllocationCard";
import { AssetIcon } from "@/components/domain/AssetIcon";
import { HoldingsTable } from "@/components/domain/HoldingsTable";
import { PortfolioChartCard } from "@/components/domain/PortfolioChartCard";
import { ResetDialog } from "@/components/domain/ResetDialog";
import type { GlossaryKey } from "@/lib/glossary";

function Kpi({ label, term, children, sub, action, className }: { label: string; term?: GlossaryKey; children: React.ReactNode; sub?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <Card className={`card-p min-w-0 ${className ?? ""}`}>
      <span className="block truncate text-xs text-muted">{term ? <Term k={term}>{label}</Term> : label}</span>
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="min-w-0 truncate text-[17px] font-semibold text-fg">{children}</div>
        {action}
      </div>
      {sub && <div className="mt-1 truncate text-xs text-muted">{sub}</div>}
    </Card>
  );
}

export default function Overview() {
  const { valuation, account, isLoading, error } = usePortfolio();
  const prefs = usePreferences();
  const updatePrefs = useUpdatePreferences();
  const perfRange = prefs.performanceRange;
  const perfHistory = useHistory(perfRange);
  const perf = periodPerformance(perfHistory.data, valuation?.totalValue);
  const txs = useTransactions();
  const navigate = useNavigate();
  const [demoOpen, setDemoOpen] = useState(false);

  if (error && !valuation) return <ErrorState message={(error as Error).message} />;

  const hasHoldings = (valuation?.positions.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      {/* Hero */}
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-end lg:justify-between lg:p-6">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs text-muted">
              <Term k="portfolioValue">Total portfolio value</Term>
              <span className="rounded border border-line px-1.5 py-0.5 text-[10px] font-medium tracking-wider text-muted">USD</span>
            </p>
            {valuation ? (
              <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-2">
                <span className="tnum text-[34px] leading-none font-semibold tracking-tight text-fg sm:text-[42px]" data-testid="portfolio-total">
                  {formatUsd(valuation.totalValue)}
                </span>
                {perf && (
                  <span className="flex items-center gap-2">
                    <Money value={perf.pnl} signed tone className="text-sm font-medium" />
                    {perf.pct && <ChangePill value={perf.pct} />}
                    <span className="text-xs text-subtle">{RANGE_LABEL[perfRange]}</span>
                  </span>
                )}
              </div>
            ) : (
              <Skeleton className="mt-3 h-11 w-64" />
            )}
            {valuation && (
              <p className="mt-2 text-xs text-muted">
                Cash {formatUsd(valuation.cash)} · Holdings {formatUsd(valuation.holdingsValue)} · {valuation.positions.length} asset{valuation.positions.length === 1 ? "" : "s"}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => navigate(`/trade/${pairSlug(prefs.defaultMarket)}`)}>
              <ArrowLeftRight className="h-4 w-4" /> Trade
            </Button>
            <Button variant="secondary" onClick={() => navigate("/wallet?action=deposit")}>
              <ArrowDownLeft className="h-4 w-4" /> Deposit
            </Button>
            <Button variant="secondary" onClick={() => navigate("/portfolio")}>
              <Briefcase className="h-4 w-4" /> Portfolio
            </Button>
          </div>
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Available cash" term="availableCash" sub={valuation && valuation.cashReserved.gt(0) ? `${formatUsd(valuation.cashReserved)} reserved` : valuation ? `${formatUsd(valuation.cashVault)} in Vault` : undefined}>
          {valuation ? <Money value={valuation.cashAvailable} /> : <Skeleton className="h-5 w-24" />}
        </Kpi>
        <Kpi label="Unrealized P/L" term="unrealized" sub={valuation && valuation.costBasis.gt(0) ? <Pct value={valuation.unrealizedPnl.div(valuation.costBasis)} /> : "No open positions"}>
          {valuation ? <Money value={valuation.unrealizedPnl} signed tone /> : <Skeleton className="h-5 w-24" />}
        </Kpi>
        <Kpi label="Realized P/L" term="realized" sub={account ? `${account.totals.tradeCount} trades · ${formatUsd(account.totals.feesPaid)} fees` : undefined}>
          {valuation ? <Money value={valuation.realizedPnl} signed tone /> : <Skeleton className="h-5 w-24" />}
        </Kpi>
        <Kpi
          label="Performance"
          term="performance"
          action={
            <Select
              aria-label="Performance interval"
              value={perfRange}
              onChange={(e) => updatePrefs.mutate({ performanceRange: e.target.value as PortfolioRange })}
              className="-my-1 w-[70px] shrink-0 [&_select]:h-7 [&_select]:px-2 [&_select]:text-[11px]"
            >
              {PORTFOLIO_RANGES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          }
          sub={perf?.pct ? <Pct value={perf.pct} /> : perfHistory.isLoading ? undefined : "Not enough history"}
        >
          {perf ? <Money value={perf.pnl} signed tone /> : <Skeleton className="h-5 w-24" />}
        </Kpi>
        <Kpi className="col-span-2 md:col-span-1" label="Total return" term="totalReturn" sub={valuation ? <>on {formatUsd(valuation.netContributions)} contributed</> : undefined}>
          {valuation ? (
            <span className="flex items-baseline gap-2">
              <Money value={valuation.totalReturn} signed tone />
              {valuation.totalReturnPct && <Pct value={valuation.totalReturnPct} className="text-xs" />}
            </span>
          ) : (
            <Skeleton className="h-5 w-24" />
          )}
        </Kpi>
      </div>

      {/* Chart + allocation */}
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <PortfolioChartCard />
        </div>
        <AllocationCard />
      </div>

      {/* Holdings */}
      <Card>
        <CardHeader
          title="Holdings"
          description={valuation ? `${valuation.positions.length} asset${valuation.positions.length === 1 ? "" : "s"} · ${formatUsd(valuation.holdingsValue)}` : undefined}
          actions={
            hasHoldings && (
              <Button variant="ghost" size="sm" onClick={() => navigate("/portfolio")}>
                View portfolio
              </Button>
            )
          }
        />
        <div className="mt-3">
          {isLoading ? (
            <SkeletonRows rows={4} />
          ) : hasHoldings && valuation ? (
            <HoldingsTable positions={valuation.positions} />
          ) : (
            <EmptyState
              icon={<Wallet className="h-5 w-5" />}
              title={valuation?.cash.isZero() ? "Your account is empty" : "Your portfolio is all cash"}
              description={
                valuation?.cash.isZero()
                  ? "Deposit funds to start trading, or load a sample portfolio with history."
                  : `${formatUsd(valuation?.cash ?? 0)} is ready to trade. Place a trade, or load a sample portfolio with history.`
              }
              action={
                <>
                  {valuation?.cash.isZero() ? (
                    <Button variant="primary" onClick={() => navigate("/wallet?action=deposit")}>
                      Deposit funds
                    </Button>
                  ) : (
                    <Button variant="primary" onClick={() => navigate(`/trade/${pairSlug(prefs.defaultMarket)}`)}>
                      Buy your first asset
                    </Button>
                  )}
                  <Button variant="secondary" onClick={() => setDemoOpen(true)}>
                    <Sparkles className="h-4 w-4" /> Load sample portfolio
                  </Button>
                </>
              }
            />
          )}
        </div>
      </Card>

      {/* Activity + watchlist */}
      <div className="grid gap-4 2xl:grid-cols-3">
        <Card className="min-w-0 2xl:col-span-2">
          <CardHeader
            title="Recent activity"
            icon={<Clock className="h-4 w-4" />}
            actions={
              <Button variant="ghost" size="sm" onClick={() => navigate("/transactions")}>
                All transactions
              </Button>
            }
          />
          <div className="mt-3">
            {!txs.data ? <SkeletonRows rows={4} /> : txs.data.length === 0 ? <EmptyState title="No activity yet" /> : <ActivityList transactions={txs.data.slice(0, 6)} />}
          </div>
        </Card>
        <WatchlistCard />
      </div>
      <ResetDialog open={demoOpen} onOpenChange={setDemoOpen} preset={{ startingState: "demo", initialBalance: account && D(account.initialBalance).gt(0) ? D(account.initialBalance).toFixed(2) : "10000.00" }} />
    </div>
  );
}

function WatchlistCard() {
  const { data, bySymbol } = useQuotes();
  const { list, toggle } = useWatchlist();
  const navigate = useNavigate();
  const movers = (data?.quotes ?? []).filter((q) => q.enabled).sort((a, b) => Math.abs(Number(b.change24h)) - Math.abs(Number(a.change24h)));
  const showing = list.length ? list.map((s) => bySymbol.get(s)).filter((q): q is NonNullable<typeof q> => Boolean(q)) : movers.slice(0, 6);
  return (
    <Card className="min-w-0">
      <CardHeader
        title={list.length ? "Watchlist" : "Top movers · 24h"}
        icon={<Star className="h-4 w-4" />}
        actions={
          <Link to="/markets" className="text-xs text-muted hover:text-fg">
            Markets
          </Link>
        }
      />
      <ul className="mt-2 grid pb-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-1">
        {!data && <SkeletonRows rows={5} />}
        {showing.map((q) => {
          const meta = getAsset(q.symbol)!;
          return (
            <li key={q.symbol} className="group flex items-center gap-3 px-[var(--card-p)] py-2 hover:bg-hover">
              <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => navigate(`/markets/${pairSlug(q.symbol)}`)}>
                <AssetIcon symbol={q.symbol} size={26} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-fg">{meta.name}</span>
                  <span className="block text-[11px] text-muted">{q.symbol}/USD</span>
                </span>
                <span className="text-right">
                  <span className="num block text-[13px] text-fg">{formatPrice(q.price, meta.priceDecimals)}</span>
                  <Pct value={q.change24h} className="text-[11px]" />
                </span>
              </button>
              <button
                onClick={() => toggle.mutate(q.symbol)}
                className="rounded p-1 text-subtle hover:text-warn"
                aria-label={list.includes(q.symbol) ? `Remove ${q.symbol} from watchlist` : `Add ${q.symbol} to watchlist`}
                aria-pressed={list.includes(q.symbol)}
              >
                <Star className={`h-3.5 w-3.5 ${list.includes(q.symbol) ? "fill-warn text-warn" : ""}`} />
              </button>
            </li>
          );
        })}
      </ul>
      {!list.length && data && <p className="px-[var(--card-p)] pb-3 text-[11px] text-subtle">Star assets to build your watchlist.</p>}
    </Card>
  );
}
