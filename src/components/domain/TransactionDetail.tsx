import { Link } from "react-router";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { getAsset } from "@shared/assets";
import { formatDateTime, formatPrice, formatQty, formatUsd } from "@shared/format";
import { useTransaction } from "@/lib/queries";
import { TX_LABEL, accountLabel } from "@/lib/txMeta";
import { Dialog, DetailRow } from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/empty";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Money } from "@/components/ui/values";
import { TxStatus, TxTypeIcon } from "./ActivityList";

export function TransactionDetail({ id, onClose }: { id: string | undefined; onClose: () => void }) {
  const q = useTransaction(id);
  const t = q.data;
  const meta = t ? getAsset(t.asset) : undefined;
  const qd = meta?.qtyDecimals ?? 2;
  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => toast.success("Copied to clipboard"),
      () => toast.error("Clipboard unavailable"),
    );
  };
  return (
    <Dialog open={Boolean(id)} onOpenChange={(o) => !o && onClose()} title="Transaction details" description="Internal paper-ledger record" side="right">
      {q.isError ? (
        <ErrorState message={(q.error as Error).message} />
      ) : !t ? (
        <SkeletonRows rows={6} />
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <TxTypeIcon tx={t} size={40} />
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-fg">
                {TX_LABEL[t.type]} {t.asset !== "USD" ? t.asset : "USD"}
              </p>
              <p className="num text-xs text-muted">{formatDateTime(t.createdAt)}</p>
            </div>
            <span className="ml-auto">
              <TxStatus />
            </span>
          </div>

          <section>
            <h3 className="mb-1 text-[11px] font-medium tracking-wide text-subtle uppercase">Amounts</h3>
            {t.quantity && <DetailRow label="Quantity" value={`${formatQty(t.quantity, qd)} ${t.asset}`} />}
            {t.unitPrice && <DetailRow label="Unit price" value={formatPrice(t.unitPrice, meta?.priceDecimals ?? 2)} />}
            <DetailRow label="Gross amount" value={formatUsd(t.gross)} />
            <DetailRow label="Fee" value={<>{formatUsd(t.fee)}{t.feeQuantity && t.feeAsset !== "USD" && <span className="text-muted"> ({t.feeQuantity} {t.feeAsset})</span>}</>} />
            <DetailRow label={t.type === "buy" ? "Net (total cost)" : t.type === "sell" ? "Net (proceeds)" : "Net amount"} value={formatUsd(t.net)} strong />
            {t.costBasis && <DetailRow label={t.type === "buy" || t.type === "deposit" ? "Cost basis added" : "Cost basis removed (FIFO)"} value={formatUsd(t.costBasis)} />}
            {t.realizedPnl && <DetailRow label="Realized P/L" value={<Money value={t.realizedPnl} signed tone />} />}
          </section>

          <section>
            <h3 className="mb-1 text-[11px] font-medium tracking-wide text-subtle uppercase">Reference</h3>
            <DetailRow
              label="Transaction ID"
              value={
                <span className="inline-flex items-center gap-1.5">
                  {t.id}
                  <button onClick={() => copy(t.id)} className="text-subtle hover:text-fg" aria-label="Copy transaction ID">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </span>
              }
            />
            <DetailRow label="Sequence" value={`#${t.seq}`} />
            {t.orderId && <DetailRow label="Related order" value={<Link className="text-accent hover:underline" to={`/trade/${t.asset}-USD`}>{t.orderId}</Link>} />}
            <DetailRow label="Account" value={t.counterAccount ? `${accountLabel(t.account)} → ${accountLabel(t.counterAccount)}` : accountLabel(t.account)} mono={false} />
            <DetailRow label="Status" value="Settled on internal ledger (not a blockchain transaction)" mono={false} />
            {t.reason && <DetailRow label="Reason" value={t.reason} mono={false} />}
            {t.note && <DetailRow label="Note" value={t.note} mono={false} />}
          </section>

          <section>
            <h3 className="mb-2 text-[11px] font-medium tracking-wide text-subtle uppercase">Ledger entries</h3>
            <div className="overflow-hidden rounded-lg border border-line">
              <table className="w-full text-xs">
                <thead className="bg-elevated text-subtle">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Entry</th>
                    <th className="px-3 py-2 text-left font-medium">Account</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(t.ledger ?? []).map((e) => {
                    const negative = e.amount.startsWith("-");
                    const d = e.asset === "USD" ? 2 : (getAsset(e.asset)?.qtyDecimals ?? 8);
                    return (
                      <tr key={e.id} className="border-t border-line">
                        <td className="num px-3 py-2 text-subtle">{e.id}</td>
                        <td className="px-3 py-2 text-muted">{accountLabel(e.account)} · {e.asset}</td>
                        <td className={`num px-3 py-2 text-right ${negative ? "text-down" : "text-up"}`}>
                          {e.asset === "USD" ? formatUsd(e.amount, { signed: true }) : `${formatQty(e.amount, d, { signed: true })} ${e.asset}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-subtle">Balances are the sum of all ledger entries. This record matches the entries above exactly.</p>
          </section>
        </div>
      )}
    </Dialog>
  );
}
