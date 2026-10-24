import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, Layers } from "lucide-react";
import { getAsset, pairSlug } from "@shared/assets";
import { D } from "@shared/decimal";
import { formatDateTime, formatPrice, formatQty, formatShortDateTime } from "@shared/format";
import { usePortfolio, usePosition } from "@/lib/queries";
import { TX_LABEL } from "@/lib/txMeta";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { Term } from "@/components/ui/tooltip";
import { ChangePill, Money, Pct } from "@/components/ui/values";
import { AssetIcon } from "@/components/domain/AssetIcon";
import { MarketChartPanel } from "@/components/domain/MarketChartPanel";
import { TxTypeIcon } from "@/components/domain/ActivityList";

export default function PortfolioAsset() {
  const { symbol: raw } = useParams();
  const meta = getAsset(raw ?? "");
  const navigate = useNavigate();
  const { valuation, account } = usePortfolio();
  const detail = usePosition(meta?.symbol ?? "BTC");
  if (!meta) return <EmptyState title="Asset not found" action={<Button onClick={() => navigate("/portfolio")}>Back to portfolio</Button>} />;
  const symbol = meta.symbol;
  const pos = valuation?.positions.find((p) => p.symbol === symbol);
  const dto = account?.positions.find((p) => p.symbol === symbol);
  const priceLines = pos?.averageEntry ? [{ price: pos.averageEntry.toNumber(), title: "Avg entry", tone: "accent" as const }] : [];

  return (
    <div className="space-y-4">
      <Link to="/portfolio" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg">
        <ArrowLeft className="h-3.5 w-3.5" /> Portfolio
      </Link>
      <Card className="p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3.5">
            <AssetIcon symbol={symbol} size={44} />
            <div>
              <h2 className="text-lg font-semibold text-fg">{meta.name} position</h2>
              <p className="num mt-0.5 text-[13px] text-muted">
                {pos ? `${formatQty(pos.quantity, meta.qtyDecimals)} ${symbol}` : `No ${symbol} held`} {pos?.price && <>· {formatPrice(pos.price, meta.priceDecimals)}</>} {pos?.change24h && <ChangePill value={pos.change24h} />}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="buy" onClick={() => navigate(`/trade/${pairSlug(symbol)}?side=buy`)}>Buy</Button>
            <Button variant="sell" disabled={!pos} onClick={() => navigate(`/trade/${pairSlug(symbol)}?side=sell`)}>Sell</Button>
            <Button variant="outline" onClick={() => navigate(`/wallet/${symbol}`)}>Wallet</Button>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 md:grid-cols-3 xl:grid-cols-6">
          <div><p className="text-xs text-muted">Market value</p><p className="mt-1 font-medium"><Money value={pos?.marketValue ?? 0} /></p></div>
          <div><p className="text-xs text-muted"><Term k="costBasis">Cost basis</Term></p><p className="mt-1 font-medium"><Money value={pos?.costBasis ?? 0} /></p></div>
          <div><p className="text-xs text-muted"><Term k="averageEntry">Avg entry</Term></p><p className="num mt-1 font-medium text-fg">{pos?.averageEntry ? formatPrice(pos.averageEntry, meta.priceDecimals) : "—"}</p></div>
          <div><p className="text-xs text-muted"><Term k="unrealized">Unrealized P/L</Term></p><p className="mt-1 font-medium"><Money value={pos?.unrealizedPnl ?? 0} signed tone /> {pos?.unrealizedPct && <Pct value={pos.unrealizedPct} className="text-xs" />}</p></div>
          <div><p className="text-xs text-muted"><Term k="realized">Realized P/L</Term></p><p className="mt-1 font-medium"><Money value={dto?.realizedPnl ?? 0} signed tone /></p></div>
          <div><p className="text-xs text-muted">Allocation</p><p className="mt-1 font-medium"><Pct value={pos?.allocation ?? 0} tone={false} signed={false} className="text-fg" /></p></div>
        </div>
      </Card>

      <Card className="min-w-0">
        <MarketChartPanel symbol={symbol} height={360} priceLines={priceLines} />
      </Card>

      <Card>
        <CardHeader title="Cost-basis lots" description="First in, first out — sells consume the oldest open lot first" icon={<Layers className="h-4 w-4" />} />
        <div className="mt-3">
          {detail.isError ? (
            <ErrorState message={(detail.error as Error).message} />
          ) : !detail.data ? (
            <SkeletonRows rows={3} />
          ) : detail.data.lots.length === 0 ? (
            <EmptyState title="No lots" description={`Lots are opened when you buy or deposit ${symbol}.`} />
          ) : (
            <Table minWidth={820}>
              <thead>
                <tr>
                  <Th>Opened</Th>
                  <Th align="right">Original qty</Th>
                  <Th align="right">Remaining qty</Th>
                  <Th align="right">Unit cost</Th>
                  <Th align="right">Remaining cost</Th>
                  <Th align="right">Unrealized</Th>
                  <Th>Status</Th>
                  <Th>Source</Th>
                </tr>
              </thead>
              <tbody>
                {detail.data.lots.map((l) => {
                  const remaining = D(l.quantity);
                  const unit = D(l.originalCost).div(l.originalQuantity);
                  const unreal = pos?.price && remaining.gt(0) ? remaining.times(pos.price).minus(l.cost) : null;
                  return (
                    <Tr key={l.id} onClick={() => navigate(`/transactions/${l.transactionId}`)}>
                      <Td className="num text-muted" title={formatDateTime(l.openedAt)}>{formatShortDateTime(l.openedAt)}</Td>
                      <Td align="right" className="num text-fg">{formatQty(l.originalQuantity, meta.qtyDecimals)}</Td>
                      <Td align="right" className="num text-fg">{formatQty(l.quantity, meta.qtyDecimals)}</Td>
                      <Td align="right" className="num text-muted">{formatPrice(unit, meta.priceDecimals)}</Td>
                      <Td align="right"><Money value={l.cost} className="text-fg" /></Td>
                      <Td align="right">{unreal ? <Money value={unreal} signed tone /> : <span className="text-subtle">—</span>}</Td>
                      <Td>{remaining.isZero() ? <Badge>Closed</Badge> : remaining.lt(l.originalQuantity) ? <Badge tone="info">Partial</Badge> : <Badge tone="accent">Open</Badge>}</Td>
                      <Td className="num text-xs text-subtle">{l.transactionId}</Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Position history" description={`Every ledger transaction involving ${symbol}`} />
        <div className="mt-3">
          {!detail.data ? (
            <SkeletonRows rows={3} />
          ) : detail.data.transactions.length === 0 ? (
            <EmptyState title="No history" />
          ) : (
            <Table minWidth={820}>
              <thead>
                <tr>
                  <Th>Type</Th>
                  <Th>Time</Th>
                  <Th align="right">Quantity</Th>
                  <Th align="right">Price</Th>
                  <Th align="right">Value</Th>
                  <Th align="right">Fee</Th>
                  <Th align="right">Realized P/L</Th>
                </tr>
              </thead>
              <tbody>
                {detail.data.transactions.map((t) => (
                  <Tr key={t.id} onClick={() => navigate(`/transactions/${t.id}`)}>
                    <Td><span className="flex items-center gap-2.5"><TxTypeIcon tx={t} /> <span className="text-fg">{TX_LABEL[t.type]}</span></span></Td>
                    <Td className="num text-muted">{formatShortDateTime(t.createdAt)}</Td>
                    <Td align="right" className="num text-fg">{t.quantity ? formatQty(t.quantity, meta.qtyDecimals) : "—"}</Td>
                    <Td align="right" className="num text-muted">{t.unitPrice ? formatPrice(t.unitPrice, meta.priceDecimals) : "—"}</Td>
                    <Td align="right"><Money value={t.gross} className="text-fg" /></Td>
                    <Td align="right"><Money value={t.fee} className="text-muted" /></Td>
                    <Td align="right">{t.realizedPnl ? <Money value={t.realizedPnl} signed tone /> : <span className="text-subtle">—</span>}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </Card>
    </div>
  );
}
