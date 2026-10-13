CREATE TABLE `store_content` (
	`key` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `store_owner` (
	`key` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL
);
