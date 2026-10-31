-- A deleted shop's data is erased for good after 30 days (Section 7.14). Daily closings
-- stay locked for every live shop; only a shop already marked deleted can lose them.
DROP TRIGGER IF EXISTS `daily_closings_no_delete`;
--> statement-breakpoint
CREATE TRIGGER `daily_closings_no_delete` BEFORE DELETE ON `daily_closings`
WHEN NOT EXISTS (SELECT 1 FROM `shops` s WHERE s.`id` = OLD.`shop_id` AND s.`deleted_at` IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'DAY_CLOSED'); END;
