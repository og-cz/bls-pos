CREATE TABLE `daily_summaries` (
	`shop_id` text NOT NULL,
	`day` text NOT NULL,
	`sales_count` integer NOT NULL,
	`gross_cents` integer NOT NULL,
	`voided_cents` integer NOT NULL,
	`cost_cents` integer NOT NULL,
	PRIMARY KEY(`shop_id`, `day`)
);
