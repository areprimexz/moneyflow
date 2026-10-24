import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Download, ReceiptText, Search, X } from "lucide-react";
import { ASSETS, getAsset } from "@shared/assets";
import { formatDateTime, formatPrice, formatQty, formatShortDateTime } from "@shared/format";
import { TRANSACTION_TYPES, type TransactionType } from "@shared/types";
import { downloadText, transactionsToCsv } from "@/lib/csv";
import { useTransactions } from "@/lib/queries";
import { TX_LABEL, cashEffect } from "@/lib/txMeta";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/empty";
import { Field, Input, Select } from "@/components/ui/form";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { Money } from "@/components/ui/values";
import { TxStatus, TxTypeIcon } from "@/components/domain/ActivityList";
import { TransactionDetail } from "@/components/domain/TransactionDetail";

const PAGE = 50;

function dayStart(v: string): number | null {
  if (!v) return null;
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y!, m! - 1, d!).getTime();
}

export default function Transactions() {
  const { id } = useParams();
  const navigate = useNavigate();
  const txs = useTransactions();
  const [q, setQ] = useState("");
  const [asset, setAsset] = useState("all");
  const [type, setType] = useState<TransactionType | "all">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [order, setOrder] = useState<"newest" | "oldest">("newest");
  const [page, setPage] = useState(1);

  const fromMs = dayStart(from);
  const toMs = dayStart(to);
  const rangeError = fromMs !== null && toMs !== null && fromMs > toMs ? "Start date must be before end date." : null;

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = (txs.data ?? []).filter((t) => {
      if (asset !== "all" && t.asset !== asset) return false;
      if (type !== "all" && t.type !== type) return false;
      if (fromMs !== null && t.createdAt < fromMs) return false;
      if (toMs !== null && t.createdAt >= toMs + 86_400_000) return false;
      if (term) {
        const hay = `${t.id} ${t.orderId ?? ""} ${t.asset} ${getAsset(t.asset)?.name ?? ""} ${TX_LABEL[t.type]} ${t.note ?? ""} ${t.reason ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
    return order === "newest" ? list : [...list].reverse();
  }, [txs.data, q, asset, type, fromMs, toMs, order]);

  const visible = rows.slice(0, page * PAGE);
  const filtersActive = q || asset !== "all" || type !== "all" || from || to;
  const clear = () => {
    setQ("");
    setAsset("all");
    setType("all");
    setFrom("");
    setTo("");
    setPage(1);
  };
  const exportCsv = () => {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    downloadText(`flux-transactions-${stamp}.csv`, transactionsToCsv(rows));
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid gap-3 p-[var(--card-p)] sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_repeat(5,minmax(0,1fr))]">
          <Field label="Search" htmlFor="tx-search">
            <Input id="tx-search" placeholder="ID, order, asset, note" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} prefix={<Search className="h-3.5 w-3.5" />} />
          </Field>
          <Field label="Asset" htmlFor="tx-asset">
            <Select id="tx-asset" value={asset} onChange={(e) => { setAsset(e.target.value); setPage(1); }}>
              <option value="all">All assets</option>
              <option value="USD">USD</option>
              {ASSETS.map((a) => <option key={a.symbol} value={a.symbol}>{a.symbol}</option>)}
            </Select>
          </Field>
          <Field label="Type" htmlFor="tx-type">
            <Select id="tx-type" value={type} onChange={(e) => { setType(e.target.value as TransactionType | "all"); setPage(1); }}>
              <option value="all">All types</option>
              {TRANSACTION_TYPES.map((t) => <option key={t} value={t}>{TX_LABEL[t]}</option>)}
            </Select>
          </Field>
          <Field label="From" htmlFor="tx-from" error={rangeError}>
            <Input id="tx-from" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} invalid={Boolean(rangeError)} />
          </Field>
          <Field label="To" htmlFor="tx-to">
            <Input id="tx-to" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
          </Field>
          <Field label="Sort" htmlFor="tx-sort">
            <Select id="tx-sort" value={order} onChange={(e) => setOrder(e.target.value as "newest" | "oldest")}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </Select>
          </Field>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-[var(--card-p)] py-2.5">
          <p className="text-xs text-muted" aria-live="polite">
            {txs.data ? <>{rows.length.toLocaleString()} of {txs.data.length.toLocaleString()} transactions</> : "Loading…"}
          </p>
          <div className="flex gap-2">
            {filtersActive && (
              <Button size="sm" variant="ghost" onClick={clear}>
                <X className="h-3.5 w-3.5" /> Clear filters
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        {txs.isError && !txs.data ? (
          <ErrorState message={(txs.error as Error).message} onRetry={() => txs.refetch()} />
        ) : !txs.data ? (
          <SkeletonRows rows={8} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<ReceiptText className="h-5 w-5" />} title="No transactions match" description="Adjust or clear the filters." action={filtersActive ? <Button onClick={clear}>Clear filters</Button> : undefined} />
        ) : (
          <>
            <div className="hidden md:block">
              <Table minWidth={1180}>
                <thead>
                  <tr>
                    <Th>Time</Th>
                    <Th>Type</Th>
                    <Th>Asset</Th>
                    <Th align="right">Quantity</Th>
                    <Th align="right">Unit price</Th>
                    <Th align="right">Gross</Th>
                    <Th align="right">Fee</Th>
                    <Th align="right">Net</Th>
                    <Th>Status</Th>
                    <Th>Order</Th>
                    <Th>ID</Th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((t) => {
                    const meta = getAsset(t.asset);
                    const effect = cashEffect(t);
                    return (
                      <Tr key={t.id} onClick={() => navigate(`/transactions/${t.id}`)} aria-label={`${TX_LABEL[t.type]} ${t.id}`} className={id === t.id ? "bg-hover" : undefined}>
                        <Td className="num text-muted" title={formatDateTime(t.createdAt)}>{formatDateTime(t.createdAt)}</Td>
                        <Td><span className="flex items-center gap-2.5"><TxTypeIcon tx={t} size={24} /><span className="text-fg">{TX_LABEL[t.type]}</span></span></Td>
                        <Td className="text-fg">{t.asset}</Td>
                        <Td align="right" className="num text-fg">{t.quantity ? formatQty(t.quantity, meta?.qtyDecimals ?? 8) : "—"}</Td>
                        <Td align="right" className="num text-muted">{t.unitPrice ? formatPrice(t.unitPrice, meta?.priceDecimals ?? 2) : "—"}</Td>
                        <Td align="right"><Money value={t.gross} className="text-fg" /></Td>
                        <Td align="right"><Money value={t.fee} className="text-muted" /></Td>
                        <Td align="right">{effect ? <Money value={effect} signed tone /> : <Money value={t.net} className="text-fg" />}</Td>
                        <Td><TxStatus /></Td>
                        <Td className="num text-xs text-subtle">{t.orderId ?? "—"}</Td>
                        <Td className="num text-xs text-subtle">{t.id}</Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
            <ul className="divide-y divide-line/70 md:hidden">
              {visible.map((t) => {
                const meta = getAsset(t.asset);
                const effect = cashEffect(t);
                return (
                  <li key={t.id}>
                    <button onClick={() => navigate(`/transactions/${t.id}`)} className="flex w-full items-center gap-3 px-[var(--card-p)] py-3 text-left hover:bg-hover">
                      <TxTypeIcon tx={t} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-fg">{TX_LABEL[t.type]} {t.asset}</span>
                        <span className="num block truncate text-[11px] text-muted">{formatShortDateTime(t.createdAt)} · {t.id}</span>
                      </span>
                      <span className="text-right">
                        {effect ? <Money value={effect} signed tone className="block text-[13px]" /> : <Money value={t.net} className="block text-[13px] text-fg" />}
                        {t.quantity && <span className="num block text-[11px] text-muted">{formatQty(t.quantity, meta?.qtyDecimals ?? 8, { trim: true })} {t.asset}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {visible.length < rows.length && (
              <div className="flex justify-center border-t border-line p-3">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)}>
                  Show more ({rows.length - visible.length} remaining)
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
      <p className="text-[11px] text-subtle">All entries are internal paper-ledger records. None of them is a blockchain transaction.</p>
      <TransactionDetail id={id} onClose={() => navigate("/transactions")} />
    </div>
  );
}
