import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Search, Star, TrendingDown, TrendingUp } from "lucide-react";
import { ASSETS, getAsset, pairSlug } from "@shared/assets";
import { formatCompactUsd, formatPrice } from "@shared/format";
import type { QuoteDTO } from "@shared/types";
import { useQuotes, useSparklines, useWatchlist } from "@/lib/queries";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Input, Select } from "@/components/ui/form";
import { Segmented } from "@/components/ui/segmented";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Table, Td, Th, Tr, SortTh, type SortState } from "@/components/ui/table";
import { compareBy } from "@/lib/sort";
import { Term } from "@/components/ui/tooltip";
import { Pct } from "@/components/ui/values";
import { Sparkline } from "@/components/charts/Sparkline";
import { AssetLabel } from "@/components/domain/AssetIcon";

type Filter = "all" | "watchlist" | "gainers" | "losers";
type Key = "name" | "price" | "change" | "volume";

export default function Markets() {
  const quotes = useQuotes();
  const spark = useSparklines();
  const { list, toggle } = useWatchlist();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<SortState<Key>>({ key: "volume", dir: "desc" });

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    let r = (quotes.data?.quotes ?? []).filter((x) => {
      const a = getAsset(x.symbol)!;
      return !term || a.name.toLowerCase().includes(term) || a.symbol.toLowerCase().includes(term);
    });
    if (filter === "watchlist") r = r.filter((x) => list.includes(x.symbol));
    if (filter === "gainers") r = r.filter((x) => Number(x.change24h) > 0);
    if (filter === "losers") r = r.filter((x) => Number(x.change24h) < 0);
    const get: Record<Key, (x: QuoteDTO) => number | string> = {
      name: (x) => getAsset(x.symbol)!.name,
      price: (x) => Number(x.price),
      change: (x) => Number(x.change24h),
      volume: (x) => Number(x.volume24h ?? 0),
    };
    return [...r].sort(compareBy(get[sort.key], sort.dir));
  }, [quotes.data, q, filter, list, sort]);

  const all = quotes.data?.quotes ?? [];
  const gainer = [...all].sort((a, b) => Number(b.change24h) - Number(a.change24h))[0];
  const loser = [...all].sort((a, b) => Number(a.change24h) - Number(b.change24h))[0];
  const totalVolume = all.reduce((acc, x) => acc + Number(x.volume24h ?? 0), 0);
  const isLive = quotes.data?.mode === "live";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="card-p">
          <p className="text-xs text-muted">Data source</p>
          <p className="mt-2 text-[15px] font-medium text-fg">{isLive ? <Term k="live">Live reference</Term> : <Term k="controlled">Controlled market</Term>}</p>
          <p className="mt-1 text-xs text-muted">{isLive ? (quotes.data?.status === "ok" ? "External provider" : "Provider unavailable — see status") : quotes.data?.speed === 0 ? "Movement paused" : `Movement ${quotes.data?.speed ?? 1}×`}</p>
        </Card>
        <Card className="card-p">
          <p className="text-xs text-muted"><Term k="volume24h">24h volume</Term></p>
          <p className="num mt-2 text-[15px] font-medium text-fg">{totalVolume ? formatCompactUsd(totalVolume) : "—"}</p>
          <p className="mt-1 text-xs text-muted">{isLive ? "Reported by provider" : "Simulated"} · {all.length} markets</p>
        </Card>
        <Card className="card-p">
          <p className="flex items-center gap-1.5 text-xs text-muted"><TrendingUp className="h-3.5 w-3.5 text-up" /> Top gainer</p>
          {gainer && (
            <p className="mt-2 flex items-baseline gap-2 text-[15px] font-medium text-fg">
              {gainer.symbol} <Pct value={gainer.change24h} className="text-[13px]" />
            </p>
          )}
          <p className="mt-1 text-xs text-muted">{gainer ? getAsset(gainer.symbol)?.name : ""}</p>
        </Card>
        <Card className="card-p">
          <p className="flex items-center gap-1.5 text-xs text-muted"><TrendingDown className="h-3.5 w-3.5 text-down" /> Top loser</p>
          {loser && (
            <p className="mt-2 flex items-baseline gap-2 text-[15px] font-medium text-fg">
              {loser.symbol} <Pct value={loser.change24h} className="text-[13px]" />
            </p>
          )}
          <p className="mt-1 text-xs text-muted">{loser ? getAsset(loser.symbol)?.name : ""}</p>
        </Card>
      </div>

      <Card>
        <div className="flex flex-col gap-3 p-[var(--card-p)] sm:flex-row sm:items-center sm:justify-between">
          <Input aria-label="Search markets" placeholder="Search name or ticker" value={q} onChange={(e) => setQ(e.target.value)} prefix={<Search className="h-3.5 w-3.5" />} className="w-full sm:max-w-xs" />
          <Segmented
            label="Filter markets"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "watchlist", label: `Watchlist${list.length ? ` (${list.length})` : ""}` },
              { value: "gainers", label: "Gainers" },
              { value: "losers", label: "Losers" },
            ]}
          />
        </div>
        {quotes.isError && !quotes.data ? (
          <ErrorState message={(quotes.error as Error).message} onRetry={() => quotes.refetch()} />
        ) : !quotes.data ? (
          <SkeletonRows rows={8} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Search className="h-5 w-5" />} title={filter === "watchlist" && !q ? "Your watchlist is empty" : "No markets match"} description={filter === "watchlist" && !q ? "Star a market to follow it here." : `Nothing matches “${q}”.`} />
        ) : (
          <>
            <div className="hidden md:block">
              <Table minWidth={900}>
                <thead>
                  <tr>
                    <Th className="w-10" aria-label="Watchlist" />
                    <SortTh label="Market" sortKey="name" sort={sort} onSort={setSort} />
                    <SortTh label="Price" sortKey="price" sort={sort} onSort={setSort} align="right" />
                    <SortTh label="24h change" sortKey="change" sort={sort} onSort={setSort} align="right" />
                    <Th align="right">24h high / low</Th>
                    <SortTh label="24h volume" sortKey="volume" sort={sort} onSort={setSort} align="right" />
                    <Th align="right">7D</Th>
                    <Th align="right" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((x) => {
                    const a = getAsset(x.symbol)!;
                    const watched = list.includes(x.symbol);
                    const series = spark.data?.series[x.symbol] ?? [];
                    return (
                      <Tr key={x.symbol} onClick={() => navigate(`/markets/${pairSlug(x.symbol)}`)} className={cn(!x.enabled && "opacity-60")} aria-label={`${a.name} market details`}>
                        <Td onClick={(e) => e.stopPropagation()} className="pr-0">
                          <button onClick={() => toggle.mutate(x.symbol)} aria-label={watched ? `Remove ${x.symbol} from watchlist` : `Add ${x.symbol} to watchlist`} aria-pressed={watched} className="rounded p-1 text-subtle hover:text-warn">
                            <Star className={cn("h-4 w-4", watched && "fill-warn text-warn")} />
                          </button>
                        </Td>
                        <Td>
                          <span className="flex items-center gap-2">
                            <AssetLabel symbol={x.symbol} sub={`${x.symbol}/USD · ${a.category}`} />
                            {!x.enabled && <Badge tone="warn">Halted</Badge>}
                          </span>
                        </Td>
                        <Td align="right" className="num font-medium text-fg">{formatPrice(x.price, a.priceDecimals)}</Td>
                        <Td align="right"><Pct value={x.change24h} /></Td>
                        <Td align="right" className="num text-xs text-muted">
                          {x.high24h ? formatPrice(x.high24h, a.priceDecimals) : "—"}
                          <span className="mx-1 text-subtle">/</span>
                          {x.low24h ? formatPrice(x.low24h, a.priceDecimals) : "—"}
                        </Td>
                        <Td align="right" className="num text-muted">{x.volume24h ? formatCompactUsd(x.volume24h) : "—"}</Td>
                        <Td align="right">
                          <span className="inline-block">
                            <Sparkline values={series} tone={series.length > 1 ? (series[series.length - 1]! >= series[0]! ? "up" : "down") : "muted"} />
                          </span>
                        </Td>
                        <Td align="right" onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" variant="outline" disabled={!x.enabled} onClick={() => navigate(`/trade/${pairSlug(x.symbol)}`)}>
                            Trade
                          </Button>
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
            <div className="md:hidden">
              <div className="flex justify-end px-[var(--card-p)] pb-2">
                <Select aria-label="Sort markets" value={`${sort.key}:${sort.dir}`} onChange={(e) => {
                  const [key, dir] = e.target.value.split(":") as [Key, "asc" | "desc"];
                  setSort({ key, dir });
                }} className="w-44">
                  <option value="volume:desc">Volume</option>
                  <option value="change:desc">Top gainers</option>
                  <option value="change:asc">Top losers</option>
                  <option value="price:desc">Price</option>
                  <option value="name:asc">Name</option>
                </Select>
              </div>
              <ul className="divide-y divide-line/70">
                {rows.map((x) => {
                  const a = getAsset(x.symbol)!;
                  return (
                    <li key={x.symbol}>
                      <button onClick={() => navigate(`/markets/${pairSlug(x.symbol)}`)} className="flex w-full items-center gap-3 px-[var(--card-p)] py-3 text-left hover:bg-hover">
                        <AssetLabel symbol={x.symbol} sub={`${x.symbol}/USD${x.enabled ? "" : " · halted"}`} />
                        <span className="ml-auto text-right">
                          <span className="num block text-[13px] text-fg">{formatPrice(x.price, a.priceDecimals)}</span>
                          <Pct value={x.change24h} className="text-[11px]" />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        )}
      </Card>
      <p className="text-[11px] text-subtle">
        {ASSETS.length} markets quoted in USD. {isLive ? "Live reference prices are informational and value the paper ledger only." : "Controlled-market prices, volume and depth are simulated by the local market engine."}
      </p>
    </div>
  );
}
