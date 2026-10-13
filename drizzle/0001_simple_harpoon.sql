CREATE TABLE `shop_customers` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`consent_version` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shop_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`note` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shop_inventory` (
	`sku` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`size` text NOT NULL,
	`stock` integer DEFAULT 0 NOT NULL CHECK (`stock` >= 0),
	`max_order` integer DEFAULT 3 NOT NULL CHECK (`max_order` BETWEEN 1 AND 99),
	`enabled` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shop_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`request_key` text NOT NULL,
	`items` text NOT NULL,
	`address` text NOT NULL,
	`total` integer NOT NULL,
	`shipping_fee` integer NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`payment` text DEFAULT 'awaiting_payment' NOT NULL,
	`request_from` text DEFAULT '' NOT NULL,
	`carrier` text DEFAULT '' NOT NULL,
	`tracking` text DEFAULT '' NOT NULL,
	`refund_ref` text DEFAULT '' NOT NULL,
	`restock` integer DEFAULT 0 NOT NULL,
	`restocked` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`catalog_revision` integer NOT NULL,
	`settings_revision` integer NOT NULL,
	`last_actor` text NOT NULL,
	`last_note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shop_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX shop_orders_request ON shop_orders(user_id, request_key);
--> statement-breakpoint
CREATE INDEX shop_orders_customer_time ON shop_orders(user_id, created_at);
--> statement-breakpoint
CREATE INDEX shop_events_order ON shop_events(order_id, id);
