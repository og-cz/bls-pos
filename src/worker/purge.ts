// Erases shops deleted more than 30 days ago (Section 7.14: soft delete, then hard delete
// after 30 days). Runs with the nightly job; a couple of shops per run keeps it inside
// the Cron limits (one D1 batch and two media-database deletes each).

import { mediaStorage } from './adapters/storage';

export const PURGE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
export const PURGES_PER_RUN = 2;

/** Every table, children first, so foreign keys never block a delete. */
const DELETES = [
  'DELETE FROM sale_items WHERE shop_id = ?1',
  'DELETE FROM stock_movements WHERE shop_id = ?1',
  'DELETE FROM sales WHERE shop_id = ?1',
  'DELETE FROM products WHERE shop_id = ?1',
  'DELETE FROM categories WHERE shop_id = ?1',
  'DELETE FROM daily_summaries WHERE shop_id = ?1',
  'DELETE FROM daily_closings WHERE shop_id = ?1',
  'DELETE FROM audit_log WHERE shop_id = ?1',
  'DELETE FROM sessions WHERE shop_id = ?1',
  'DELETE FROM recovery_codes WHERE user_id IN (SELECT id FROM users WHERE shop_id = ?1)',
  'DELETE FROM users WHERE shop_id = ?1',
  // Last, and only if it is still marked deleted (never a shop restored meanwhile).
  'DELETE FROM shops WHERE id = ?1 AND deleted_at IS NOT NULL',
];

export async function purgeDeletedShops(env: Env, now: number = Date.now()): Promise<number> {
  const { results } = await env.DB.prepare(
    'SELECT id FROM shops WHERE deleted_at IS NOT NULL AND deleted_at < ?1 LIMIT ?2',
  )
    .bind(now - PURGE_AFTER_MS, PURGES_PER_RUN)
    .all<{ id: string }>();
  for (const { id } of results) {
    // Photos and backups first: if this run stops halfway, the rows are still there to
    // find the shop again next night.
    const storage = mediaStorage(env);
    await storage.deletePrefix(`shops/${id}/`);
    await storage.deletePrefix(`backups/${id}/`);
    await env.DB.batch(DELETES.map((q) => env.DB.prepare(q).bind(id)));
  }
  return results.length;
}
