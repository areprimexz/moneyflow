import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Persistence model. Every monetary value and quantity is stored as a canonical
 * decimal string and processed with decimal.js — never as a binary float.
 *
 * Source of truth:
 *  - Balances (USD cash and asset quantities, per Spot/Vault account) are the sum of
 *    `ledger_entries`. No balance is stored anywhere else.
 *  - Cost basis is tracked by `lots` (acquisitions) minus `lot_consumptions` (disposals).
 *  - `transactions` are the user-facing records; each owns the ledger entries it posted.
 */

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  initialBalance: text("initial_balance").notNull(),
  baselineAt: integer("baseline_at").notNull(),
  startingState: text("starting_state", { enum: ["cash", "demo"] }).notNull(),
  revision: integer("revision").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    seq: integer("seq").notNull(),
    type: text("type", { enum: ["buy", "sell", "deposit", "withdrawal", "transfer", "fee_adjustment", "balance_adjustment"] }).notNull(),
    status: text("status", { enum: ["settled"] }).notNull(),
    asset: text("asset").notNull(),
    quantity: text("quantity"),
    unitPrice: text("unit_price"),
    gross: text("gross").notNull(),
    fee: text("fee").notNull(),
    net: text("net").notNull(),
    direction: text("direction", { enum: ["in", "out", "internal"] }).notNull(),
    account: text("account", { enum: ["spot", "vault"] }).notNull(),
    counterAccount: text("counter_account", { enum: ["spot", "vault"] }),
    orderId: text("order_id"),
    realizedPnl: text("realized_pnl"),
    costBasis: text("cost_basis"),
    feeAsset: text("fee_asset").notNull(),
    feeQuantity: text("fee_quantity"),
    reason: text("reason"),
    note: text("note"),
    /** True when the entry is an external flow (deposit, withdrawal, admin balance adjustment). */
    isFlow: integer("is_flow", { mode: "boolean" }).notNull(),
    /** USD value of the flow (signed) used for performance measurement. */
    flowValue: text("flow_value").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("transactions_seq_idx").on(t.seq), index("transactions_created_idx").on(t.createdAt), index("transactions_order_idx").on(t.orderId)],
);

export const ledgerEntries = sqliteTable(
  "ledger_entries",
  {
    id: text("id").primaryKey(),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id),
    account: text("account", { enum: ["spot", "vault"] }).notNull(),
    asset: text("asset").notNull(),
    amount: text("amount").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("ledger_tx_idx").on(t.transactionId), index("ledger_asset_idx").on(t.asset, t.account)],
);

export const lots = sqliteTable(
  "lots",
  {
    id: text("id").primaryKey(),
    symbol: text("symbol").notNull(),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id),
    openedAt: integer("opened_at").notNull(),
    quantity: text("quantity").notNull(),
    cost: text("cost").notNull(),
  },
  (t) => [index("lots_symbol_idx").on(t.symbol)],
);

export const lotConsumptions = sqliteTable(
  "lot_consumptions",
  {
    id: text("id").primaryKey(),
    lotId: text("lot_id")
      .notNull()
      .references(() => lots.id),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id),
    quantity: text("quantity").notNull(),
    cost: text("cost").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("consumptions_lot_idx").on(t.lotId)],
);

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    clientOrderId: text("client_order_id").notNull(),
    symbol: text("symbol").notNull(),
    side: text("side", { enum: ["buy", "sell"] }).notNull(),
    type: text("type", { enum: ["market", "limit"] }).notNull(),
    quantity: text("quantity").notNull(),
    limitPrice: text("limit_price"),
    status: text("status", { enum: ["open", "filled", "cancelled", "rejected"] }).notNull(),
    feeRate: text("fee_rate").notNull(),
    reserved: text("reserved").notNull(),
    filledPrice: text("filled_price"),
    filledAt: integer("filled_at"),
    transactionId: text("transaction_id"),
    liquidity: text("liquidity", { enum: ["maker", "taker"] }),
    cancelReason: text("cancel_reason"),
    lastCheckedAt: integer("last_checked_at").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [uniqueIndex("orders_client_idx").on(t.clientOrderId), index("orders_status_idx").on(t.status)],
);

export const watchlist = sqliteTable("watchlist", {
  symbol: text("symbol").primaryKey(),
  addedAt: integer("added_at").notNull(),
});
