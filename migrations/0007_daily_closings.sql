CREATE TABLE `daily_closings` (
	`id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`day` text NOT NULL,
	`start_ms` integer NOT NULL,
	`end_ms` integer NOT NULL,
	`first_sale_number` integer,
	`last_sale_number` integer,
	`sales_count` integer NOT NULL,
	`gross_cents` integer NOT NULL,
	`voided_count` integer NOT NULL,
	`voided_cents` integer NOT NULL,
	`payments_json` text NOT NULL,
	`closed_by` text NOT NULL,
	`closed_at` integer NOT NULL,
	FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`closed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `daily_closings_shop_window` ON `daily_closings` (`shop_id`,`start_ms`);--> statement-breakpoint
CREATE UNIQUE INDEX `daily_closings_shop_day` ON `daily_closings` (`shop_id`,`day`);--> statement-breakpoint
-- A closed day is locked (Section 7.16): no new sales and no voids inside its window.
CREATE TRIGGER `sales_day_closed_insert` BEFORE INSERT ON `sales`
WHEN EXISTS (SELECT 1 FROM `daily_closings` c WHERE c.`shop_id` = NEW.`shop_id`
  AND NEW.`created_at` >= c.`start_ms` AND NEW.`created_at` < c.`end_ms`)
BEGIN SELECT RAISE(ABORT, 'DAY_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER `sales_day_closed_update` BEFORE UPDATE OF `status`, `total_cents`, `created_at` ON `sales`
WHEN EXISTS (SELECT 1 FROM `daily_closings` c WHERE c.`shop_id` = OLD.`shop_id`
  AND OLD.`created_at` >= c.`start_ms` AND OLD.`created_at` < c.`end_ms`)
BEGIN SELECT RAISE(ABORT, 'DAY_CLOSED'); END;
--> statement-breakpoint
-- Closings are written once and never changed.
CREATE TRIGGER `daily_closings_no_update` BEFORE UPDATE ON `daily_closings`
BEGIN SELECT RAISE(ABORT, 'DAY_CLOSED'); END;
--> statement-breakpoint
CREATE TRIGGER `daily_closings_no_delete` BEFORE DELETE ON `daily_closings`
BEGIN SELECT RAISE(ABORT, 'DAY_CLOSED'); END;
