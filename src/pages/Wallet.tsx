import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Landmark, Lock } from "lucide-react";
import { ASSETS, getAsset } from "@shared/assets";
import { D, ZERO } from "@shared/decimal";
import { formatQty, formatUsd } from "@shared/format";
import { usePortfolio, usePreferences, useTransactions } from "@/lib/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Skeleton, SkeletonRows } from "@/components/ui/skeleton";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { Term } from "@/components/ui/tooltip";
import { Money } from "@/components/ui/values";
import { ActivityList } from "@/components/domain/ActivityList";
import { AssetLabel } from "@/components/domain/AssetIcon";
import { WalletActionDialog, type WalletAction } from "@/components/domain/WalletActionDialog";

export default function Wallet() {
  const { valuation, account, error } = usePortfolio();
  const prefs = usePreferences();
  const txs = useTransactions();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [action, setAction] = useState<WalletAction | null>(null);

  useEffect(() => {
    const a = params.get("action");
    if (a === "deposit" || a === "withdraw" || a === "transfer") {
      setAction(a);
      params.delete("action");
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const rows = useMemo(() => {
    if (!valuation || !account) return [];
    const usd = { symbol: "USD", spot: D(account.cash.spot), vault: D(account.cash.vault), value: valuation.cash, network: "USD cash" };
    const assets = ASSETS.map((a) => {
      const p = valuation.positions.find((x) => x.symbol === a.symbol);
      return { symbol: a.symbol, spot: p?.spot ?? ZERO, vault: p?.vault ?? ZERO, value: p?.marketValue ?? ZERO, network: `${a.network.name}${a.network.standard && a.network.standard !== "Native" ? ` · ${a.network.standard}` : ""}` };
    }).filter((r) => r.spot.gt(0) || r.vault.gt(0) || !prefs.hideSmallBalances);
    return [usd, ...assets.sort((x, y) => y.value.comparedTo(x.value))];
  }, [valuation, account, prefs.hideSmallBalances]);

  const spotValue = valuation ? valuation.cashSpot.plus(valuation.positions.reduce((acc, p) => acc.plus(p.price ? p.spot.times(p.price) : 0), ZERO)) : null;
  const vaultValue = valuation && spotValue ? valuation.totalValue.minus(spotValue) : null;
  const walletTx = (txs.data ?? []).filter((t) => ["deposit", "withdrawal", "transfer"].includes(t.type));

  if (error && !valuation) return <ErrorState message={(error as Error).message} />;

  return (
    <div className="space-y-4">
      <Card className="p-5 lg:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs text-muted">Main portfolio</p>
            {valuation ? <p className="tnum mt-2 text-[32px] leading-none font-semibold text-fg">{formatUsd(valuation.totalValue)}</p> : <Skeleton className="mt-2 h-9 w-56" />}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => setAction("deposit")}><ArrowDownLeft className="h-4 w-4" /> Deposit</Button>
            <Button variant="secondary" onClick={() => setAction("withdraw")}><ArrowUpRight className="h-4 w-4" /> Withdraw</Button>
            <Button variant="secondary" onClick={() => setAction("transfer")}><ArrowLeftRight className="h-4 w-4" /> Transfer</Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="card-p">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[13px] font-medium text-fg"><Landmark className="h-4 w-4 text-accent" /> <Term k="spot">Spot account</Term></span>
            <Badge tone="accent">Trading</Badge>
          </div>
          <p className="mt-3"><Money value={spotValue} className="text-xl font-semibold text-fg" /></p>
          <p className="mt-1 text-xs text-muted">
            Cash {account ? formatUsd(account.cash.spot) : "—"}
            {account && D(account.cash.reserved).gt(0) && <> · {formatUsd(account.cash.reserved)} reserved by orders</>}
          </p>
        </Card>
        <Card className="card-p">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[13px] font-medium text-fg"><Lock className="h-4 w-4 text-info" /> <Term k="vault">Vault account</Term></span>
            <Badge tone="info">Holding</Badge>
          </div>
          <p className="mt-3"><Money value={vaultValue} className="text-xl font-semibold text-fg" /></p>
          <p className="mt-1 text-xs text-muted">Cash {account ? formatUsd(account.cash.vault) : "—"} · not available for trading</p>
        </Card>
      </div>

      <Card>
        <CardHeader title="Balances" description="Spot and Vault balances per asset" />
        <div className="mt-3">
          {!valuation ? (
            <SkeletonRows rows={6} />
          ) : (
            <Table minWidth={820}>
              <thead>
                <tr>
                  <Th>Asset</Th>
                  <Th>Network</Th>
                  <Th align="right">Spot</Th>
                  <Th align="right">Vault</Th>
                  <Th align="right">Total</Th>
                  <Th align="right">Value</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const dec = r.symbol === "USD" ? 2 : getAsset(r.symbol)!.qtyDecimals;
                  const fmt = (v: typeof r.spot) => (r.symbol === "USD" ? formatUsd(v) : formatQty(v, dec));
                  return (
                    <Tr key={r.symbol} onClick={() => navigate(`/wallet/${r.symbol}`)} aria-label={`${r.symbol} wallet details`}>
                      <Td><AssetLabel symbol={r.symbol} /></Td>
                      <Td className="text-muted">{r.network}</Td>
                      <Td align="right" className="num text-fg">{fmt(r.spot)}</Td>
                      <Td align="right" className="num text-muted">{fmt(r.vault)}</Td>
                      <Td align="right" className="num text-fg">{fmt(r.spot.plus(r.vault))}</Td>
                      <Td align="right"><Money value={r.value} className="font-medium text-fg" /></Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Wallet activity" description="Deposits, withdrawals and internal transfers" />
        <div className="mt-3">
          {!txs.data ? <SkeletonRows rows={3} /> : walletTx.length === 0 ? <EmptyState title="No wallet activity" /> : <ActivityList transactions={walletTx.slice(0, 10)} />}
        </div>
      </Card>

      {action && <WalletActionDialog action={action} open={Boolean(action)} onOpenChange={(o) => !o && setAction(null)} />}
    </div>
  );
}
