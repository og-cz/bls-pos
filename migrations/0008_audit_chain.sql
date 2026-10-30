ALTER TABLE `audit_log` ADD `chain_seq` integer;--> statement-breakpoint
ALTER TABLE `audit_log` ADD `chain_hash` text;--> statement-breakpoint
CREATE UNIQUE INDEX `audit_log_shop_chain` ON `audit_log` (`shop_id`,`chain_seq`);