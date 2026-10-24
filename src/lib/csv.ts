import type { TransactionDTO } from "@shared/types";
import { TX_LABEL } from "./txMeta";

function cell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // Neutralise spreadsheet formula injection and quote when needed.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function transactionsToCsv(rows: TransactionDTO[]): string {
  const header = ["id", "timestamp_utc", "type", "status", "asset", "quantity", "unit_price_usd", "gross_usd", "fee_usd", "net_usd", "direction", "account", "counter_account", "order_id", "realized_pnl_usd", "cost_basis_usd", "fee_asset", "fee_quantity", "reason", "note"];
  const lines = rows.map((t) =>
    [
      t.id,
      new Date(t.createdAt).toISOString(),
      TX_LABEL[t.type],
      "settled (internal ledger)",
      t.asset,
      t.quantity,
      t.unitPrice,
      t.gross,
      t.fee,
      t.net,
      t.direction,
      t.account,
      t.counterAccount,
      t.orderId,
      t.realizedPnl,
      t.costBasis,
      t.feeAsset,
      t.feeQuantity,
      t.reason,
      t.note,
    ]
      .map(cell)
      .join(","),
  );
  return [header.join(","), ...lines].join("\r\n");
}

export function downloadText(filename: string, text: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
