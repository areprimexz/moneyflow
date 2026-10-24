import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { getAsset } from "@shared/assets";
import { formatPrice, formatQty } from "@shared/format";
import type { OrderDTO } from "@shared/types";
import { localTransactionIds } from "@/lib/localWrites";
import { useLedgerInvalidation, useOrders, usePreferences, useTransactions } from "@/lib/queries";
import { TX_LABEL } from "@/lib/txMeta";

/**
 * Background notifications: toasts when a resting limit order fills (detected from
 * order state transitions) and when ledger entries appear from outside this tab.
 */
export function ActivityWatcher() {
  const prefs = usePreferences();
  const orders = useOrders();
  const txs = useTransactions();
  const invalidate = useLedgerInvalidation();
  const prevOrders = useRef<Map<string, OrderDTO["status"]> | null>(null);
  const knownTx = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!orders.data) return;
    const prev = prevOrders.current;
    const next = new Map(orders.data.map((o) => [o.id, o.status]));
    if (prev) {
      const fills = orders.data.filter((o) => o.status === "filled" && prev.get(o.id) === "open");
      for (const o of fills) {
        if (o.transactionId) localTransactionIds.add(o.transactionId);
        if (prefs.notifyOrderFills) {
          const a = getAsset(o.symbol);
          toast.success(`Limit ${o.side} filled`, {
            description: `${formatQty(o.quantity, a?.qtyDecimals ?? 8, { trim: true })} ${o.symbol} at ${formatPrice(o.filledPrice, a?.priceDecimals ?? 2)}`,
          });
        }
      }
      if (fills.length) void invalidate();
    }
    prevOrders.current = next;
  }, [orders.data, prefs.notifyOrderFills, invalidate]);

  useEffect(() => {
    if (!txs.data) return;
    const known = knownTx.current;
    if (known) {
      const fresh = txs.data.filter((t) => !known.has(t.id) && !localTransactionIds.has(t.id) && !t.orderId);
      if (fresh.length && prefs.notifyLedgerChanges) {
        toast.info(fresh.length === 1 ? `Ledger updated: ${TX_LABEL[fresh[0]!.type]}` : `Ledger updated: ${fresh.length} new entries`, { description: "Recorded outside this tab." });
      }
    }
    knownTx.current = new Set(txs.data.map((t) => t.id));
  }, [txs.data, prefs.notifyLedgerChanges]);

  return null;
}
