CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`user_id` text NOT NULL,
	`shop_id` text NOT NULL,
	`user_agent` text,
	`ip_hash` text,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_shop_id` ON `sessions` (`shop_id`);--> statement-breakpoint
CREATE INDEX `sessions_user_id` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `shops` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`business_type` text NOT NULL,
	`bio` text,
	`currency` text DEFAULT 'PHP' NOT NULL,
	`timezone` text DEFAULT 'Asia/Manila' NOT NULL,
	`plan` text DEFAULT 'free' NOT NULL,
	`theme_json` text NOT NULL,
	`logo_key` text,
	`cover_key` text,
	`storefront_enabled` integer DEFAULT false NOT NULL,
	`storefront_show_prices` integer DEFAULT true NOT NULL,
	`storefront_show_stock` integer DEFAULT false NOT NULL,
	`onboarding_step` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`deleted_at` integer,
	CONSTRAINT "shops_business_type" CHECK("shops"."business_type" IN ('cafe','retail','sari_sari','salon','food_stall','other'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shops_slug_unique` ON `shops` (`slug`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`avatar_key` text,
	`role` text NOT NULL,
	`password_hash` text NOT NULL,
	`totp_secret_enc` text,
	`failed_logins` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "users_role" CHECK("users"."role" IN ('owner','admin','staff'))
);
--> statement-breakpoint
CREATE INDEX `users_shop_id` ON `users` (`shop_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_shop_username` ON `users` (`shop_id`,`username`);