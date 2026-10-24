import { useNavigate } from "react-router";
import { getAsset } from "@shared/assets";
import { formatDateTime, formatQty, formatShortDateTime, formatUsd } from "@shared/format";
import type { TransactionDTO } from "@shared/types";
import { TX_ICON, TX_LABEL, cashEffect, txTone } from "@/lib/txMeta";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { Money } from "@/components/ui/values";

export function TxTypeIcon({ tx, size = 28 }: { tx: TransactionDTO; size?: number }) {
  const Icon = TX_ICON[tx.type];
  const tone = txTone(tx);
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg",
        tone === "up" ? "bg-up-soft text-up" : tone === "down" ? "bg-down-soft text-down" : tone === "accent" ? "bg-accent-soft text-accent" : "bg-elevated text-muted",
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}

export function TxStatus() {
  return (
    <Badge tone="neutral" dot className="text-muted">
      Settled · ledger
    </Badge>
  );
}

function qtyText(t: TransactionDTO) {
  if (!t.quantity) return "—";
  const meta = getAsset(t.asset);
  return `${formatQty(t.quantity, meta?.qtyDecimals ?? 8, { trim: true })} ${t.asset}`;
}

/** Compact recent-activity view. Every row is a ledger transaction. */
export function ActivityList({ transactions }: { transactions: TransactionDTO[] }) {
  const navigate = useNavigate();
  return (
    <>
      <div className="hidden md:block">
        <Table minWidth={860}>
          <thead>
            <tr>
              <Th>Type</Th>
              <Th>Asset</Th>
              <Th align="right">Quantity</Th>
              <Th align="right">USD value</Th>
              <Th align="right">Fee</Th>
              <Th>Time</Th>
              <Th>Status</Th>
              <Th>Reference</Th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => {
              const effect = cashEffect(t);
              return (
                <Tr key={t.id} onClick={() => navigate(`/transactions/${t.id}`)} aria-label={`${TX_LABEL[t.type]} ${t.asset} details`}>
                  <Td>
                    <span className="flex items-center gap-2.5">
                      <TxTypeIcon tx={t} />
                      <span className="text-fg">{TX_LABEL[t.type]}</span>
                    </span>
                  </Td>
                  <Td className="text-fg">{t.asset}</Td>
                  <Td align="right" className="num text-fg">{qtyText(t)}</Td>
                  <Td align="right">{effect ? <Money value={effect} signed tone /> : <Money value={t.gross} className="text-fg" />}</Td>
                  <Td align="right"><Money value={t.fee} className="text-muted" /></Td>
                  <Td className="num text-muted" title={formatDateTime(t.createdAt)}>{formatShortDateTime(t.createdAt)}</Td>
                  <Td><TxStatus /></Td>
                  <Td className="num text-xs text-subtle">{t.id}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </div>
      <ul className="divide-y divide-line/70 md:hidden">
        {transactions.map((t) => {
          const effect = cashEffect(t);
          return (
            <li key={t.id}>
              <button onClick={() => navigate(`/transactions/${t.id}`)} className="flex w-full items-center gap-3 px-[var(--card-p)] py-3 text-left hover:bg-hover">
                <TxTypeIcon tx={t} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-fg">{TX_LABEL[t.type]} {t.asset !== "USD" && t.asset}</span>
                  <span className="num block truncate text-[11px] text-muted">{formatShortDateTime(t.createdAt)} · {t.id}</span>
                </span>
                <span className="text-right">
                  {effect ? <Money value={effect} signed tone className="block text-[13px]" /> : <Money value={t.gross} className="block text-[13px] text-fg" />}
                  <span className="num block text-[11px] text-muted">{t.quantity ? qtyText(t) : `Fee ${formatUsd(t.fee)}`}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
