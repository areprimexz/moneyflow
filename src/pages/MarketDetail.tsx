import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, Star } from "lucide-react";
import { getAsset, pairSlug, symbolFromSlug } from "@shared/assets";
import { formatCompactUsd, formatPrice, formatQty } from "@shared/format";
import { usePortfolio, useQuote, useWatchlist } from "@/lib/queries";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { DetailRow } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Term } from "@/components/ui/tooltip";
import { ChangePill, Money, Pct } from "@/components/ui/values";
import { AssetIcon } from "@/components/domain/AssetIcon";
import { MarketChartPanel } from "@/components/domain/MarketChartPanel";
import { TradesTape } from "@/components/domain/TradesTape";

export default function MarketDetail() {
  const { pair } = useParams();
  const symbol = symbolFromSlug(pair);
  const navigate = useNavigate();
  const quote = useQuote(symbol);
  const { valuation } = usePortfolio();
  const { list, toggle } = useWatchlist();
  if (!symbol) {
    return <EmptyState title="Market not found" description={`“${pair}” is not a listed market.`} action={<Button onClick={() => navigate("/markets")}>Back to markets</Button>} />;
  }
  const meta = getAsset(symbol)!;
  const position = valuation?.positions.find((p) => p.symbol === symbol);
  const watched = list.includes(symbol);
  const priceLines = position?.averageEntry ? [{ price: position.averageEntry.toNumber(), title: "Avg entry", tone: "accent" as const }] : [];

  return (
    <div className="space-y-4">
      <Link to="/markets" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg">
        <ArrowLeft className="h-3.5 w-3.5" /> Markets
      </Link>
      <Card className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3.5">
            <AssetIcon symbol={symbol} size={44} />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-fg">{meta.name}</h2>
                <Badge>{symbol}/USD</Badge>
                <Badge tone="neutral">{meta.category}</Badge>
                {quote && !quote.enabled && <Badge tone="warn">Trading halted</Badge>}
              </div>
              {quote ? (
                <div className="mt-1 flex flex-wrap items-baseline gap-3">
                  <span className="num text-2xl font-semibold text-fg">{formatPrice(quote.price, meta.priceDecimals)}</span>
                  <ChangePill value={quote.change24h} size="md" />
                  <span className="text-xs text-subtle">{quote.source === "live" ? "Live prices" : quote.source === "controlled-fallback" ? "Fallback prices" : "Market Data"}</span>
                </div>
              ) : (
                <Skeleton className="mt-2 h-7 w-48" />
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => toggle.mutate(symbol)} aria-pressed={watched}>
              <Star className={cn("h-4 w-4", watched && "fill-warn text-warn")} /> {watched ? "Watching" : "Watch"}
            </Button>
            <Button variant="buy" disabled={quote && !quote.enabled} onClick={() => navigate(`/trade/${pairSlug(symbol)}?side=buy`)}>
              Buy {symbol}
            </Button>
            <Button variant="sell" disabled={(quote && !quote.enabled) || !position} onClick={() => navigate(`/trade/${pairSlug(symbol)}?side=sell`)}>
              Sell {symbol}
            </Button>
          </div>
        </div>
        {quote && (
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-4">
            <div><p className="text-xs text-muted">24h open</p><p className="num mt-1 text-fg">{quote.open24h ? formatPrice(quote.open24h, meta.priceDecimals) : "—"}</p></div>
            <div><p className="text-xs text-muted">24h high</p><p className="num mt-1 text-fg">{quote.high24h ? formatPrice(quote.high24h, meta.priceDecimals) : "—"}</p></div>
            <div><p className="text-xs text-muted">24h low</p><p className="num mt-1 text-fg">{quote.low24h ? formatPrice(quote.low24h, meta.priceDecimals) : "—"}</p></div>
            <div><p className="text-xs text-muted"><Term k="volume24h">24h volume</Term></p><p className="num mt-1 text-fg">{quote.volume24h ? formatCompactUsd(quote.volume24h) : "—"}</p></div>
          </div>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="min-w-0">
          <MarketChartPanel symbol={symbol} height={440} priceLines={priceLines} />
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Your position" />
            <div className="card-p pt-3">
              {position ? (
                <>
                  <DetailRow label="Holdings" value={`${formatQty(position.quantity, meta.qtyDecimals)} ${symbol}`} />
                  <DetailRow label="Market value" value={<Money value={position.marketValue} />} />
                  <DetailRow label={<Term k="averageEntry">Avg entry</Term>} value={position.averageEntry ? formatPrice(position.averageEntry, meta.priceDecimals) : "—"} />
                  <DetailRow label={<Term k="unrealized">Unrealized P/L</Term>} value={<span><Money value={position.unrealizedPnl} signed tone /> <Pct value={position.unrealizedPct} className="text-xs" /></span>} />
                  <Button variant="ghost" size="sm" className="mt-2 -ml-2" onClick={() => navigate(`/portfolio/${symbol}`)}>
                    Position details
                  </Button>
                </>
              ) : (
                <p className="text-[13px] text-muted">You don’t hold {symbol}.</p>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title={`About ${meta.name}`} />
            <div className="card-p pt-3">
              <p className="text-[13px] leading-relaxed text-muted">{meta.description}</p>
              <div className="mt-3 border-t border-line pt-2">
                <DetailRow label="Network" value={meta.network.name} mono={false} />
                <DetailRow label="Token standard" value={meta.network.standard ?? "Native"} mono={false} />
                <DetailRow label="Consensus" value={meta.network.consensus} mono={false} />
                <DetailRow label="Block time" value={meta.network.avgBlockTime} mono={false} />
              </div>
            </div>
          </Card>
        </div>
      </div>
      <Card>
        <CardHeader title="Recent market trades" />
        <TradesTape symbol={symbol} rows={14} />
      </Card>
    </div>
  );
}
