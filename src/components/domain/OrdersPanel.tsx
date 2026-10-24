import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { X } from "lucide-react";
import { getAsset } from "@shared/assets";
import { formatPrice, formatQty, formatShortDateTime, formatUsd } from "@shared/format";
import type { OrderDTO } from "@shared/types";
import { api } from "@/lib/api";
import { useLedgerInvalidation, useOrders, useTransactions } from "@/lib/queries";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/empty";
import { Segmented } from "@/components/ui/segmented";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { Money } from "@/components/ui/values";

type Tab = "open" | "history" | "trades";

function StatusBadge({ o }: { o: OrderDTO }) {
  if (o.status === "filled") return <Badge tone="up">Filled{o.liquidity ? ` · ${o.liquidity}` : ""}</Badge>;
  if (o.status === "open") return <Badge tone="info" dot>Open</Badge>;
  if (o.status === "cancelled") return <Badge>Cancelled</Badge>;
  return <Badge tone="down">Rejected</Badge>;
}

export function OrdersPanel({ symbol }: { symbol: string }) {
  const [tab, setTab] = useState<Tab>("open");
  const [thisPair, setThisPair] = useState(false);
  const orders = useOrders();
  const txs = useTransactions();
  const invalidate = useLedgerInvalidation();
  const navigate = useNavigate();
  const cancel = useMutation({
    mutationFn: (id: string) => api.cancelOrder(id),
    onSuccess: (r) => {
      toast.success("Order cancelled", { description: `${r.order.id} · reserved funds released` });
      void invalidate();
    },
    onError: (e: Error) => toast.error("Could not cancel order", { description: e.message }),
  });

  const filtered = useMemo(() => (orders.data ?? []).filter((o) => !thisPair || o.symbol === symbol), [orders.data, thisPair, symbol]);
  const open = filtered.filter((o) => o.status === "open");
  const history = filtered.filter((o) => o.status !== "open");
  const trades = (txs.data ?? []).filter((t) => (t.type === "buy" || t.type === "sell") && (!thisPair || t.asset === symbol));
  const openCount = (orders.data ?? []).filter((o) => o.status === "open").length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-[var(--card-p)] pt-[var(--card-p)]">
        <Segmented
          label="Orders view"
          value={tab}
          onChange={setTab}
          options={[
            { value: "open", label: `Open orders${openCount ? ` (${openCount})` : ""}` },
            { value: "history", label: "Order history" },
            { value: "trades", label: "Trade history" },
          ]}
        />
        <Checkbox label={`${symbol}/USD only`} checked={thisPair} onChange={setThisPair} />
      </div>
      <div className="mt-3">
        {!orders.data ? (
          <SkeletonRows rows={3} />
        ) : tab === "trades" ? (
          trades.length === 0 ? (
            <EmptyState title="No trades yet" description="Executed buys and sells appear here." />
          ) : (
            <Table minWidth={760}>
              <thead>
                <tr>
                  <Th>Time</Th>
                  <Th>Pair</Th>
                  <Th>Side</Th>
                  <Th align="right">Price</Th>
                  <Th align="right">Quantity</Th>
                  <Th align="right">Fee</Th>
                  <Th align="right">Net</Th>
                  <Th align="right">Realized P/L</Th>
                </tr>
              </thead>
              <tbody>
                {trades.slice(0, 50).map((t) => {
                  const a = getAsset(t.asset)!;
                  return (
                    <Tr key={t.id} onClick={() => navigate(`/transactions/${t.id}`)}>
                      <Td className="num text-muted">{formatShortDateTime(t.createdAt)}</Td>
                      <Td className="text-fg">{t.asset}/USD</Td>
                      <Td className={t.type === "buy" ? "text-up" : "text-down"}>{t.type === "buy" ? "Buy" : "Sell"}</Td>
                      <Td align="right" className="num text-fg">{formatPrice(t.unitPrice, a.priceDecimals)}</Td>
                      <Td align="right" className="num text-fg">{formatQty(t.quantity, a.qtyDecimals)}</Td>
                      <Td align="right"><Money value={t.fee} className="text-muted" /></Td>
                      <Td align="right"><Money value={t.net} className="text-fg" /></Td>
                      <Td align="right">{t.realizedPnl ? <Money value={t.realizedPnl} signed tone /> : <span className="text-subtle">—</span>}</Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          )
        ) : (tab === "open" ? open : history).length === 0 ? (
          <EmptyState title={tab === "open" ? "No open orders" : "No order history"} description={tab === "open" ? "Resting limit orders appear here until they fill or you cancel them." : "Filled, cancelled and rejected orders appear here."} />
        ) : (
          <Table minWidth={900}>
            <thead>
              <tr>
                <Th>Created</Th>
                <Th>Pair</Th>
                <Th>Side / type</Th>
                <Th align="right">Limit</Th>
                <Th align="right">Quantity</Th>
                <Th align="right">{tab === "open" ? "Reserved" : "Fill price"}</Th>
                <Th>Status</Th>
                <Th>Order ID</Th>
                {tab === "open" && <Th align="right" />}
              </tr>
            </thead>
            <tbody>
              {(tab === "open" ? open : history).slice(0, 100).map((o) => {
                const a = getAsset(o.symbol)!;
                return (
                  <Tr key={o.id} onClick={o.transactionId ? () => navigate(`/transactions/${o.transactionId}`) : undefined}>
                    <Td className="num text-muted">{formatShortDateTime(o.createdAt)}</Td>
                    <Td className="text-fg">{o.symbol}/USD</Td>
                    <Td>
                      <span className={cn("font-medium", o.side === "buy" ? "text-up" : "text-down")}>{o.side === "buy" ? "Buy" : "Sell"}</span>
                      <span className="ml-1.5 text-muted capitalize">{o.type}</span>
                    </Td>
                    <Td align="right" className="num text-fg">{o.limitPrice ? formatPrice(o.limitPrice, a.priceDecimals) : "Market"}</Td>
                    <Td align="right" className="num text-fg">{formatQty(o.quantity, a.qtyDecimals)}</Td>
                    <Td align="right" className="num text-fg">
                      {tab === "open" ? (o.side === "buy" ? formatUsd(o.reserved) : `${formatQty(o.reserved, a.qtyDecimals)} ${o.symbol}`) : o.filledPrice ? formatPrice(o.filledPrice, a.priceDecimals) : "—"}
                    </Td>
                    <Td>
                      <span title={o.cancelReason ?? undefined}>
                        <StatusBadge o={o} />
                      </span>
                    </Td>
                    <Td className="num text-xs text-subtle">{o.id}</Td>
                    {tab === "open" && (
                      <Td align="right">
                        <Button size="xs" variant="outline" loading={cancel.isPending && cancel.variables === o.id} onClick={() => cancel.mutate(o.id)} aria-label={`Cancel order ${o.id}`}>
                          <X className="h-3 w-3" /> Cancel
                        </Button>
                      </Td>
                    )}
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </div>
    </div>
  );
}
