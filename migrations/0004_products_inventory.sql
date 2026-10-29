CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `categories_shop_id` ON `categories` (`shop_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `categories_shop_name` ON `categories` (`shop_id`,`name`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`category_id` text,
	`name` text NOT NULL,
	`sku` text,
	`price_cents` integer NOT NULL,
	`cost_cents` integer,
	`track_stock` integer DEFAULT true NOT NULL,
	`stock` integer DEFAULT 0 NOT NULL,
	`low_stock_threshold` integer DEFAULT 5 NOT NULL,
	`image_key` text,
	`show_on_storefront` integer DEFAULT true NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "products_price" CHECK("products"."price_cents" >= 0),
	CONSTRAINT "products_cost" CHECK("products"."cost_cents" >= 0),
	CONSTRAINT "products_stock" CHECK("products"."track_stock" = 0 OR "products"."stock" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_shop_sku` ON `products` (`shop_id`,`sku`) WHERE "products"."sku" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `products_shop_id` ON `products` (`shop_id`);--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`product_id` text NOT NULL,
	`user_id` text NOT NULL,
	`delta` integer NOT NULL,
	`reason` text NOT NULL,
	`note` text,
	`sale_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "stock_movements_reason" CHECK("stock_movements"."reason" IN ('restock','sale','void','damaged','expired','used','lost','correction'))
);
--> statement-breakpoint
CREATE INDEX `stock_movements_shop_id` ON `stock_movements` (`shop_id`,`id`);--> statement-breakpoint
CREATE INDEX `stock_movements_product_id` ON `stock_movements` (`product_id`);