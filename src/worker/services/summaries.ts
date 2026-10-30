import { eq } from 'drizzle-orm';

import { dayStartMs, addDays, localDay } from '@shared/time';

import type { Db } from '../db/client';
import { shops } from '../db/schema';

/**
 * SQL that (re)computes the summary of one local day for every shop matched by `scope`:
 * completed sales count and total, voided total, and the cost of what was sold. The work
 * runs inside D1, so it costs the Worker almost no CPU. Safe to run any number of times.
 */
export function summaryStatement(
  db: Db,
  scope: { shopId: string } | { timeZone: string },
  day: string,
  timeZone: string,
): D1PreparedStatement {
  const start = dayStartMs(day, timeZone);
  const end = dayStartMs(addDays(day, 1), timeZone);
  const shopFilter =
    'shopId' in scope
      ? 's.shop_id = ?4'
      : 's.shop_id IN (SELECT id FROM shops WHERE timezone = ?4)';
  return db.$client
    .prepare(
      `INSERT INTO daily_summaries (shop_id, day, sales_count, gross_cents, voided_cents, cost_cents)
       SELECT s.shop_id, ?1,
         sum(s.status = 'completed'),
         coalesce(sum(CASE WHEN s.status = 'completed' THEN s.total_cents END), 0),
         coalesce(sum(CASE WHEN s.status = 'voided' THEN s.total_cents END), 0),
         coalesce(sum(CASE WHEN s.status = 'completed' THEN
           (SELECT coalesce(sum(coalesce(i.unit_cost_cents, 0) * i.quantity), 0)
            FROM sale_items i WHERE i.sale_id = s.id) END), 0)
       FROM sales s
       WHERE ${shopFilter} AND s.created_at >= ?2 AND s.created_at < ?3
       GROUP BY s.shop_id
       ON CONFLICT (shop_id, day) DO UPDATE SET
         sales_count = excluded.sales_count,
         gross_cents = excluded.gross_cents,
         voided_cents = excluded.voided_cents,
         cost_cents = excluded.cost_cents`,
    )
    .bind(day, start, end, 'shopId' in scope ? scope.shopId : scope.timeZone);
}

/** Refreshes the shop's summary for the local day containing `atMs` (e.g. after a void). */
export async function refreshShopDayAt(db: Db, shopId: string, atMs: number): Promise<void> {
  const shop = await db
    .select({ timezone: shops.timezone })
    .from(shops)
    .where(eq(shops.id, shopId))
    .get();
  if (!shop) return;
  await summaryStatement(db, { shopId }, localDay(atMs, shop.timezone), shop.timezone).run();
}
