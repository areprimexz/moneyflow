import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowDownLeft, ArrowLeftRight, ArrowLeft, ArrowUpRight } from "lucide-react";
import { getAsset, pairSlug } from "@shared/assets";
import { D, ZERO } from "@shared/decimal";
import { formatPrice, formatQty, formatUsd } from "@shared/format";
import { usePortfolio, useTransactions } from "@/lib/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { DetailRow } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Money } from "@/components/ui/values";
import { ActivityList } from "@/components/domain/ActivityList";
import { AssetIcon } from "@/components/domain/AssetIcon";
import { WalletActionDialog, type WalletAction } from "@/components/domain/WalletActionDialog";

export default function WalletAsset() {
  const { symbol: raw } = useParams();
  const symbol = (raw ?? "").toUpperCase();
  const isUsd = symbol === "USD";
  const meta = isUsd ? null : getAsset(symbol);
  const navigate = useNavigate();
  const { valuation, account } = usePortfolio();
  const txs = useTransactions();
  const [action, setAction] = useState<WalletAction | null>(null);
  if (!isUsd && !meta) return <EmptyState title="Asset not found" action={<Button onClick={() => navigate("/wallet")}>Back to wallet</Button>} />;
  const pos = valuation?.positions.find((p) => p.symbol === symbol);
  const spot = isUsd ? (account ? D(account.cash.spot) : ZERO) : (pos?.spot ?? ZERO);
  const vault = isUsd ? (account ? D(account.cash.vault) : ZERO) : (pos?.vault ?? ZERO);
  const reserved = isUsd ? (account ? D(account.cash.reserved) : ZERO) : (pos?.reserved ?? ZERO);
  const dec = meta?.qtyDecimals ?? 2;
  const fmt = (v: typeof spot) => (isUsd ? formatUsd(v) : `${formatQty(v, dec)} ${symbol}`);
  const history = (txs.data ?? []).filter((t) => t.asset === symbol);

  return (
    <div className="space-y-4">
      <Link to="/wallet" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg">
        <ArrowLeft className="h-3.5 w-3.5" /> Wallet
      </Link>
      <Card className="p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3.5">
            <AssetIcon symbol={symbol} size={44} />
            <div>
              <h2 className="text-lg font-semibold text-fg">{isUsd ? "US Dollar" : meta!.name}</h2>
              <p className="num text-[13px] text-muted">{fmt(spot.plus(vault))} {!isUsd && pos?.price && <>· <Money value={pos.marketValue} /></>}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => setAction("deposit")}><ArrowDownLeft className="h-4 w-4" /> Deposit</Button>
            <Button variant="secondary" onClick={() => setAction("withdraw")}><ArrowUpRight className="h-4 w-4" /> Withdraw</Button>
            <Button variant="secondary" onClick={() => setAction("transfer")}><ArrowLeftRight className="h-4 w-4" /> Transfer</Button>
            {!isUsd && <Button variant="outline" onClick={() => navigate(`/trade/${pairSlug(symbol)}`)}>Trade</Button>}
          </div>
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Balances" />
          <div className="card-p pt-3">
            <DetailRow label="Spot (trading)" value={fmt(spot)} />
            <DetailRow label="Reserved by open orders" value={fmt(reserved)} />
            <DetailRow label="Available in Spot" value={fmt(spot.minus(reserved))} />
            <DetailRow label="Vault (holding)" value={fmt(vault)} />
            <DetailRow label="Total" value={fmt(spot.plus(vault))} strong />
            {!isUsd && pos?.price && <DetailRow label="Reference price" value={formatPrice(pos.price, meta!.priceDecimals)} />}
          </div>
        </Card>
        <Card>
          <CardHeader title="Network & asset metadata" description="Reference information — the paper ledger does not interact with any network" />
          <div className="card-p pt-3">
            {isUsd ? (
              <>
                <DetailRow label="Ledger" value="Internal USD cash ledger" mono={false} />
                <DetailRow label="Precision" value="2 decimals (cents)" mono={false} />
                <DetailRow label="Deposit / withdrawal fee" value="$0.00" />
              </>
            ) : (
              <>
                <DetailRow label="Network" value={meta!.network.name} mono={false} />
                <DetailRow label="Token standard" value={meta!.network.standard ?? "Native"} mono={false} />
                <DetailRow label="Consensus" value={meta!.network.consensus} mono={false} />
                <DetailRow label="Average block time" value={meta!.network.avgBlockTime} mono={false} />
                <DetailRow label="Typical exchange confirmations" value={String(meta!.network.confirmations)} />
                <DetailRow label="Simulated withdrawal fee" value={`${meta!.network.withdrawalFee} ${symbol}`} />
                <DetailRow label="Minimum withdrawal" value={`${meta!.network.minWithdrawal} ${symbol}`} />
                <DetailRow label="Quantity precision" value={`${meta!.qtyDecimals} decimals`} mono={false} />
              </>
            )}
            <div className="mt-2 flex items-center gap-2"><Badge>No on-chain address</Badge><Badge>Not connected</Badge></div>
          </div>
        </Card>
      </div>
      <Card>
        <CardHeader title="Transaction history" description={`Ledger entries involving ${symbol}`} />
        <div className="mt-3">{!txs.data ? <SkeletonRows rows={3} /> : history.length === 0 ? <EmptyState title="No transactions yet" /> : <ActivityList transactions={history.slice(0, 50)} />}</div>
      </Card>
      {action && <WalletActionDialog action={action} asset={symbol} open onOpenChange={(o) => !o && setAction(null)} />}
    </div>
  );
}
