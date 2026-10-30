CREATE TABLE `sale_items` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_id` text NOT NULL,
	`shop_id` text NOT NULL,
	`product_id` text NOT NULL,
	`name_snapshot` text NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`unit_cost_cents` integer,
	`quantity` integer NOT NULL,
	`line_total_cents` integer NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sale_items_quantity" CHECK("sale_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE INDEX `sale_items_sale_id` ON `sale_items` (`sale_id`);--> statement-breakpoint
CREATE INDEX `sale_items_shop_product` ON `sale_items` (`shop_id`,`product_id`);--> statement-breakpoint
CREATE TABLE `sales` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`number` integer NOT NULL,
	`user_id` text NOT NULL,
	`subtotal_cents` integer NOT NULL,
	`discount_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer NOT NULL,
	`payment_method` text NOT NULL,
	`payment_reference` text,
	`cash_received_cents` integer,
	`change_cents` integer,
	`idempotency_key` text NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`voided_by` text,
	`voided_at` integer,
	`void_reason` text,
	`created_at` integer NOT NULL,
	`client_created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sales_status" CHECK("sales"."status" IN ('completed','voided')),
	CONSTRAINT "sales_amounts" CHECK("sales"."subtotal_cents" >= 0 AND "sales"."discount_cents" >= 0 AND "sales"."total_cents" >= 0 AND "sales"."discount_cents" <= "sales"."subtotal_cents")
);
--> statement-breakpoint
CREATE INDEX `sales_shop_created` ON `sales` (`shop_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `sales_shop_user_created` ON `sales` (`shop_id`,`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `sales_shop_idempotency` ON `sales` (`shop_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `sales_shop_number` ON `sales` (`shop_id`,`number`);