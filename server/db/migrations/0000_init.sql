CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`initial_balance` text NOT NULL,
	`baseline_at` integer NOT NULL,
	`starting_state` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL,
	`account` text NOT NULL,
	`asset` text NOT NULL,
	`amount` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ledger_tx_idx` ON `ledger_entries` (`transaction_id`);--> statement-breakpoint
CREATE INDEX `ledger_asset_idx` ON `ledger_entries` (`asset`,`account`);--> statement-breakpoint
CREATE TABLE `lot_consumptions` (
	`id` text PRIMARY KEY NOT NULL,
	`lot_id` text NOT NULL,
	`transaction_id` text NOT NULL,
	`quantity` text NOT NULL,
	`cost` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`lot_id`) REFERENCES `lots`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `consumptions_lot_idx` ON `lot_consumptions` (`lot_id`);--> statement-breakpoint
CREATE TABLE `lots` (
	`id` text PRIMARY KEY NOT NULL,
	`symbol` text NOT NULL,
	`transaction_id` text NOT NULL,
	`opened_at` integer NOT NULL,
	`quantity` text NOT NULL,
	`cost` text NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `lots_symbol_idx` ON `lots` (`symbol`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`client_order_id` text NOT NULL,
	`symbol` text NOT NULL,
	`side` text NOT NULL,
	`type` text NOT NULL,
	`quantity` text NOT NULL,
	`limit_price` text,
	`status` text NOT NULL,
	`fee_rate` text NOT NULL,
	`reserved` text NOT NULL,
	`filled_price` text,
	`filled_at` integer,
	`transaction_id` text,
	`liquidity` text,
	`cancel_reason` text,
	`last_checked_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_client_idx` ON `orders` (`client_order_id`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`seq` integer NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`asset` text NOT NULL,
	`quantity` text,
	`unit_price` text,
	`gross` text NOT NULL,
	`fee` text NOT NULL,
	`net` text NOT NULL,
	`direction` text NOT NULL,
	`account` text NOT NULL,
	`counter_account` text,
	`order_id` text,
	`realized_pnl` text,
	`cost_basis` text,
	`fee_asset` text NOT NULL,
	`fee_quantity` text,
	`reason` text,
	`note` text,
	`is_flow` integer NOT NULL,
	`flow_value` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_seq_idx` ON `transactions` (`seq`);--> statement-breakpoint
CREATE INDEX `transactions_created_idx` ON `transactions` (`created_at`);--> statement-breakpoint
CREATE INDEX `transactions_order_idx` ON `transactions` (`order_id`);--> statement-breakpoint
CREATE TABLE `watchlist` (
	`symbol` text PRIMARY KEY NOT NULL,
	`added_at` integer NOT NULL
);
