import { addDays, localDay } from '@shared/time';

import { mediaStorage } from './adapters/storage';

// Nightly backups (Section 7.14): each shop's data as gzipped JSON in private storage,
// backups/<shopId>/<day>.json.gz, kept 14 days. Never under shops/, so the /media route
// can never serve them. Gzip makes them about 10x smaller, which matters on D1 storage.
//
// Free-plan limits shape this: a Cron run gets 10 ms of CPU and 50 subrequests. So D1
// builds the JSON itself (the Worker only compresses and stores it), and shops are spread
// over the 24 hours by their id: an hourly run backs up only its hour's shops, three
// subrequests each.

/** Must match the hourly trigger in wrangler.jsonc. */
export const BACKUP_CRON = '25 * * * *';
export const BACKUP_KEEP_DAYS = 14;
export const BACKUPS_PER_RUN = 15;

const hex = (pos: number) => `(instr('0123456789abcdef', substr(id, ${String(pos)}, 1)) - 1)`;
/** 0–23 from the last two hex digits of the shop id (UUIDv7, random at the end). */
export const BACKUP_HOUR_SQL = `((${hex(-1)} + 16 * ${hex(-2)}) % 24)`;

/** The whole backup document for one shop, built by D1. No password hashes or secrets. */
const BACKUP_SQL = `
SELECT json_object(
  'format', 'bls-pos-backup',
  'version', 1,
  'day', ?2,
  'shop', (SELECT json_object('name', name, 'slug', slug, 'businessType', business_type,
    'currency', currency, 'timezone', timezone, 'bio', bio, 'theme', json(theme_json))
    FROM shops WHERE id = ?1),
  'categories', (SELECT json_group_array(json_object('id', id, 'name', name))
    FROM categories WHERE shop_id = ?1),
  'products', (SELECT json_group_array(json_object('id', id, 'name', name, 'sku', sku,
    'categoryId', category_id, 'priceCents', price_cents, 'costCents', cost_cents,
    'trackStock', track_stock, 'stock', stock, 'lowStockThreshold', low_stock_threshold,
    'archived', archived_at IS NOT NULL))
    FROM products WHERE shop_id = ?1),
  'staff', (SELECT json_group_array(json_object('id', id, 'username', username,
    'displayName', display_name, 'role', role, 'active', active))
    FROM users WHERE shop_id = ?1),
  'sales', (SELECT json_group_array(json_object('number', s.number, 'status', s.status,
    'createdAt', s.created_at, 'totalCents', s.total_cents, 'paymentMethod', s.payment_method,
    'userId', s.user_id, 'voidReason', s.void_reason,
    'lines', (SELECT json_group_array(json_object('productId', i.product_id,
      'name', i.name_snapshot, 'quantity', i.quantity, 'unitPriceCents', i.unit_price_cents,
      'unitCostCents', i.unit_cost_cents)) FROM sale_items i WHERE i.sale_id = s.id)))
    FROM sales s WHERE s.shop_id = ?1 AND s.created_at >= ?3),
  'auditHead', (SELECT json_object('seq', chain_seq, 'hash', chain_hash) FROM audit_log
    WHERE shop_id = ?1 AND chain_seq IS NOT NULL ORDER BY chain_seq DESC LIMIT 1),
  'dailyClosings', (SELECT json_group_array(json_object('day', day, 'grossCents', gross_cents,
    'salesCount', sales_count, 'voidedCents', voided_cents,
    'firstSaleNumber', first_sale_number, 'lastSaleNumber', last_sale_number))
    FROM daily_closings WHERE shop_id = ?1)
) AS doc`;

async function gzip(text: string): Promise<ArrayBuffer> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

export function backupKey(shopId: string, day: string): string {
  return `backups/${shopId}/${day}.json.gz`;
}

/**
 * Backs up the shops whose hour it is (UTC hour of `now`), up to BACKUPS_PER_RUN, and
 * removes each one's backup from BACKUP_KEEP_DAYS ago. Sales of the last 2 days are
 * included; older sales are in earlier backups.
 */
export async function runBackups(env: Env, now: number = Date.now()): Promise<number> {
  const hour = new Date(now).getUTCHours();
  const { results } = await env.DB.prepare(
    `SELECT id, timezone FROM shops WHERE deleted_at IS NULL AND ${BACKUP_HOUR_SQL} = ?1
     ORDER BY id LIMIT ?2`,
  )
    .bind(hour, BACKUPS_PER_RUN)
    .all<{ id: string; timezone: string }>();

  const storage = mediaStorage(env);
  const since = now - 2 * 86_400_000;
  for (const shop of results) {
    const day = localDay(now, shop.timezone);
    const row = await env.DB.prepare(BACKUP_SQL).bind(shop.id, day, since).first<{ doc: string }>();
    if (!row) continue;
    await storage.put(backupKey(shop.id, day), await gzip(row.doc), 'application/gzip');
    await storage.delete(backupKey(shop.id, addDays(day, -BACKUP_KEEP_DAYS)));
  }
  return results.length;
}
