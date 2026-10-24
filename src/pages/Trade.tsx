import { useMemo, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router";
import { ChevronDown } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { ASSETS, getAsset, pairSlug, symbolFromSlug } from "@shared/assets";
import { formatCompactUsd, formatPrice } from "@shared/format";
import { useOrders, usePreferences, useQuote, useQuotes } from "@/lib/queries";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { Term } from "@/components/ui/tooltip";
import { ChangePill, Pct } from "@/components/ui/values";
import { AssetIcon } from "@/components/domain/AssetIcon";
import { MarketChartPanel } from "@/components/domain/MarketChartPanel";
import { OrderBook } from "@/components/domain/OrderBook";
import { OrderForm, type PricePrefill } from "@/components/domain/OrderForm";
import { OrdersPanel } from "@/components/domain/OrdersPanel";
import { TradesTape } from "@/components/domain/TradesTape";
import type { PriceLineSpec } from "@/components/charts/CandleChart";

function PairSelector({ symbol }: { symbol: string }) {
  const navigate = useNavigate();
  const { bySymbol } = useQuotes();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="flex items-center gap-2.5 rounded-lg py-1 pr-2 pl-1 transition-colors hover:bg-hover" aria-label="Select market">
          <AssetIcon symbol={symbol} size={32} />
          <span className="text-left">
            <span className="flex items-center gap-1 text-[15px] font-semibold text-fg">
              {symbol}/USD <ChevronDown className="h-4 w-4 text-muted" />
            </span>
            <span className="block text-[11px] text-muted">{getAsset(symbol)?.name}</span>
          </span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={6} className="z-50 max-h-[60vh] w-72 overflow-y-auto rounded-xl border border-line-strong bg-card p-1 shadow-2xl">
          {ASSETS.map((a) => {
            const q = bySymbol.get(a.symbol);
            return (
              <DropdownMenu.Item
                key={a.symbol}
                onSelect={() => navigate(`/trade/${pairSlug(a.symbol)}`)}
                className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 outline-none data-[highlighted]:bg-hover", a.symbol === symbol && "bg-accent-soft")}
              >
                <AssetIcon symbol={a.symbol} size={24} />
                <span className="flex-1 text-[13px] text-fg">
                  {a.symbol}/USD {q && !q.enabled && <span className="ml-1 text-[10px] text-warn">halted</span>}
                </span>
                {q && (
                  <span className="text-right">
                    <span className="num block text-xs text-fg">{formatPrice(q.price, a.priceDecimals)}</span>
                    <Pct value={q.change24h} className="text-[11px]" />
                  </span>
                )}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export default function Trade() {
  const { pair } = useParams();
  const [params] = useSearchParams();
  const prefs = usePreferences();
  const symbol = symbolFromSlug(pair);
  const quote = useQuote(symbol);
  const quotes = useQuotes();
  const orders = useOrders();
  const [prefill, setPrefill] = useState<PricePrefill | null>(null);
  const [sideTab, setSideTab] = useState<"book" | "trades">("book");
  const initialSide = params.get("side") === "sell" ? "sell" : "buy";

  const priceLines = useMemo<PriceLineSpec[]>(
    () =>
      (orders.data ?? [])
        .filter((o) => o.status === "open" && o.symbol === symbol && o.limitPrice)
        .map((o) => ({ price: Number(o.limitPrice), title: `${o.side === "buy" ? "Buy" : "Sell"} limit`, tone: o.side === "buy" ? "up" : "down" })),
    [orders.data, symbol],
  );

  if (!pair) return <Navigate to={`/trade/${pairSlug(prefs.defaultMarket)}`} replace />;
  if (!symbol) return <Navigate to="/trade" replace />;
  const meta = getAsset(symbol)!;
  const pick = (price: string) => setPrefill({ price, nonce: Date.now() });

  return (
    <div className="space-y-4">
      {/* Market header */}
      <Card className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <PairSelector symbol={symbol} />
          <div>
            <div className={cn("num text-xl font-semibold", quote && Number(quote.change24h) < 0 ? "text-down" : "text-up")}>{quote ? formatPrice(quote.price, meta.priceDecimals) : "—"}</div>
            <div className="flex items-center gap-2 text-[11px] text-muted">
              {quote && <ChangePill value={quote.change24h} className="sm:hidden" />}
              {quote?.source === "live" ? "Live prices" : quote?.source === "controlled-fallback" ? "Fallback prices" : "Market Data"}
            </div>
          </div>
          <div className="hidden gap-6 text-xs sm:flex">
            <div>
              <div className="text-muted">24h change</div>
              <div className="mt-0.5">{quote ? <ChangePill value={quote.change24h} /> : "—"}</div>
            </div>
            <div>
              <div className="text-muted">24h high</div>
              <div className="num mt-0.5 text-fg">{quote?.high24h ? formatPrice(quote.high24h, meta.priceDecimals) : "—"}</div>
            </div>
            <div>
              <div className="text-muted">24h low</div>
              <div className="num mt-0.5 text-fg">{quote?.low24h ? formatPrice(quote.low24h, meta.priceDecimals) : "—"}</div>
            </div>
            <div className="hidden md:block">
              <div className="text-muted"><Term k="volume24h">24h volume</Term></div>
              <div className="num mt-0.5 text-fg">{quote?.volume24h ? formatCompactUsd(quote.volume24h) : "—"}</div>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {quote && !quote.enabled && <Badge tone="warn">Trading halted</Badge>}
            {quotes.data?.mode === "live" && quotes.data.status !== "ok" && <Badge tone="down">Live prices unavailable</Badge>}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_290px_340px]">
        <Card className="min-w-0 lg:min-h-[520px]">
          <MarketChartPanel symbol={symbol} height={480} priceLines={priceLines} />
        </Card>
        <Card className="order-last hidden min-w-0 2xl:order-none 2xl:block">
          <CardHeader title="Order book" />
          <div className="mt-2">
            <OrderBook symbol={symbol} onPickPrice={pick} levels={11} />
          </div>
        </Card>
        <Card className="min-w-0 self-start">
          <OrderForm key={symbol} symbol={symbol} initialSide={initialSide} prefill={prefill} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="min-w-0">
          <OrdersPanel symbol={symbol} />
        </Card>
        <Card className="min-w-0">
          <div className="flex items-center justify-between px-[var(--card-p)] pt-[var(--card-p)]">
            <Segmented
              label="Market data"
              value={sideTab}
              onChange={setSideTab}
              options={[
                { value: "book", label: "Order book" },
                { value: "trades", label: "Market trades" },
              ]}
              size="xs"
            />
          </div>
          <div className="mt-2">{sideTab === "book" ? <OrderBook symbol={symbol} onPickPrice={pick} levels={8} /> : <TradesTape symbol={symbol} rows={18} />}</div>
        </Card>
      </div>
    </div>
  );
}
