import { and, count, eq, isNull, sql } from 'drizzle-orm';

import { entitlementsFor } from '@shared/entitlements';
import { checkRows, type ImportProduct } from '@shared/import-validate';
import type { ImportChunkInput, ImportChunkResult } from '@shared/schemas/import';

import type { Db } from '../db/client';
import { isUniqueViolation } from '../db/errors';
import { newId } from '../db/id';
import { products, shops } from '../db/schema';
import type { Actor } from '../lib/actor';
import { ApiError } from '../lib/errors';
import { auditStatement } from './audit';

/**
 * Saves one chunk of an import (Phase 3.5). Rows whose SKU already exists in the shop
 * update that product; the rest are added. Every row is checked again here with the same
 * rules the browser used. The chunk is written in one batch: all of it or none of it.
 *
 * Built for the free plan: each list goes to D1 as a single JSON value read with
 * json_each, so a 250-row chunk is about 8 queries, never near the 100-parameter or
 * 50-query limits.
 */
export async function importChunk(
  db: Db,
  shopId: string,
  actor: Actor,
  input: ImportChunkInput,
  now: number = Date.now(),
): Promise<ImportChunkResult> {
  const checked = checkRows(input.rows);
  const skipped = checked
    .filter((r) => !r.check.ok)
    .map((r) => ({
      line: r.line,
      message: r.check.ok ? '' : Object.values(r.check.errors).join('; '),
    }));
  const valid = checked.flatMap((r) => (r.check.ok ? [r.check.product] : []));
  const result: ImportChunkResult = {
    created: 0,
    updated: 0,
    skipped,
    stockIgnored: 0,
    categoriesCreated: 0,
  };
  if (valid.length === 0) return result;

  // Which SKUs already exist here?
  const skus = valid.flatMap((p) => (p.sku ? [p.sku] : []));
  const existing = skus.length
    ? await db.all<{ sku: string }>(
        sql`SELECT sku FROM products WHERE shop_id = ${shopId} AND sku IN (SELECT value FROM json_each(${JSON.stringify(skus)}))`,
      )
    : [];
  const existingSkus = new Set(existing.map((r) => r.sku));
  const updates = valid.filter((p) => p.sku && existingSkus.has(p.sku));
  const creates = valid.filter((p) => !p.sku || !existingSkus.has(p.sku));

  await checkRoom(db, shopId, creates.length);

  // Categories by name, ignoring case; new names are created.
  const categoryId = new Map<string, string>();
  const names = [
    ...new Map(
      valid.flatMap((p) => (p.category ? [[p.category.toLowerCase(), p.category] as const] : [])),
    ).values(),
  ];
  if (names.length) {
    const found = await db.all<{ id: string; name: string }>(
      sql`SELECT id, name FROM categories WHERE shop_id = ${shopId} AND lower(name) IN (SELECT lower(value) FROM json_each(${JSON.stringify(names)}))`,
    );
    for (const c of found) categoryId.set(c.name.toLowerCase(), c.id);
  }
  const newCategories = names
    .filter((n) => !categoryId.has(n.toLowerCase()))
    .map((name) => ({ id: newId(now), name }));
  for (const c of newCategories) categoryId.set(c.name.toLowerCase(), c.id);
  const catOf = (p: ImportProduct) =>
    p.category ? (categoryId.get(p.category.toLowerCase()) ?? null) : null;

  const newRows = creates.map((p) => {
    const track = p.trackStock ?? true;
    return {
      id: newId(now),
      name: p.name,
      sku: p.sku,
      cat: catOf(p),
      price: p.priceCents,
      cost: p.costCents,
      track: track ? 1 : 0,
      stock: track ? (p.stock ?? 0) : 0,
      low: p.lowStockThreshold ?? 5,
    };
  });
  const openingStock = newRows
    .filter((r) => r.stock > 0)
    .map((r) => ({ id: newId(now), productId: r.id, delta: r.stock }));
  const updateRows = updates.map((p) => ({
    sku: p.sku,
    name: p.name,
    cat: catOf(p),
    price: p.priceCents,
    cost: p.costCents,
    low: p.lowStockThreshold,
    track: p.trackStock === null ? null : p.trackStock ? 1 : 0,
  }));

  // Raw D1 statements (Drizzle's batch takes only its own query builders).
  const raw = (query: string, ...params: unknown[]) => db.$client.prepare(query).bind(...params);
  const statements: D1PreparedStatement[] = [];
  if (newCategories.length) {
    statements.push(
      raw(
        `INSERT INTO categories (id, shop_id, name)
        SELECT json_extract(value, '$.id'), ?, json_extract(value, '$.name')
        FROM json_each(?)`,
        shopId,
        JSON.stringify(newCategories),
      ),
    );
  }
  if (newRows.length) {
    statements.push(
      raw(
        `INSERT INTO products (id, shop_id, category_id, name, sku, price_cents, cost_cents,
          track_stock, stock, low_stock_threshold, show_on_storefront, created_at, updated_at)
        SELECT json_extract(value, '$.id'), ?, json_extract(value, '$.cat'),
          json_extract(value, '$.name'), json_extract(value, '$.sku'), json_extract(value, '$.price'),
          json_extract(value, '$.cost'), json_extract(value, '$.track'), json_extract(value, '$.stock'),
          json_extract(value, '$.low'), 1, ?, ?
        FROM json_each(?)`,
        shopId,
        now,
        now,
        JSON.stringify(newRows),
      ),
    );
  }
  if (openingStock.length) {
    // Opening stock is logged like any other stock change.
    statements.push(
      raw(
        `INSERT INTO stock_movements (id, shop_id, product_id, user_id, delta, reason, note, created_at)
        SELECT json_extract(value, '$.id'), ?, json_extract(value, '$.productId'), ?,
          json_extract(value, '$.delta'), 'restock', 'Opening stock (import)', ?
        FROM json_each(?)`,
        shopId,
        actor.userId,
        now,
        JSON.stringify(openingStock),
      ),
    );
  }
  if (updateRows.length) {
    // Empty cells keep what the product already has; stock is never changed here.
    statements.push(
      raw(
        `UPDATE products SET
          name = j.name,
          price_cents = j.price,
          cost_cents = coalesce(j.cost, products.cost_cents),
          category_id = coalesce(j.cat, products.category_id),
          low_stock_threshold = coalesce(j.low, products.low_stock_threshold),
          track_stock = coalesce(j.track, products.track_stock),
          updated_at = ?
        FROM (SELECT json_extract(value, '$.sku') AS sku, json_extract(value, '$.name') AS name,
            json_extract(value, '$.cat') AS cat, json_extract(value, '$.price') AS price,
            json_extract(value, '$.cost') AS cost, json_extract(value, '$.low') AS low,
            json_extract(value, '$.track') AS track
          FROM json_each(?)) AS j
        WHERE products.shop_id = ? AND products.sku = j.sku`,
        now,
        JSON.stringify(updateRows),
        shopId,
      ),
    );
  }
  statements.push(
    auditStatement(
      db,
      shopId,
      {
        action: 'product.import',
        userId: actor.userId,
        details: {
          created: newRows.length,
          updated: updateRows.length,
          categoriesCreated: newCategories.length,
          skipped: skipped.length,
        },
        ipHash: actor.ipHash,
      },
      now,
    ),
  );

  try {
    await db.$client.batch(statements);
  } catch (err) {
    // Someone added the same SKU or category at the same moment.
    if (isUniqueViolation(err, 'products.') || isUniqueViolation(err, 'categories.')) {
      throw new ApiError(409, 'IMPORT_CONFLICT', 'Products changed while importing. Try again.');
    }
    throw err;
  }

  return {
    ...result,
    created: newRows.length,
    updated: updateRows.length,
    stockIgnored: updates.filter((p) => p.stock !== null).length,
    categoriesCreated: newCategories.length,
  };
}

/** The plan's product limit counts active products (archived ones don't). */
async function checkRoom(db: Db, shopId: string, adding: number) {
  if (adding === 0) return;
  const shop = await db.select({ plan: shops.plan }).from(shops).where(eq(shops.id, shopId)).get();
  const { maxProducts } = entitlementsFor(shop?.plan ?? 'free');
  const current = await db
    .select({ n: count() })
    .from(products)
    .where(and(eq(products.shopId, shopId), isNull(products.archivedAt)))
    .get();
  const room = maxProducts - (current?.n ?? 0);
  if (adding > room) {
    throw new ApiError(
      409,
      'PRODUCT_LIMIT_REACHED',
      `Your plan allows up to ${maxProducts.toLocaleString()} products; ${Math.max(0, room).toLocaleString()} more fit. Archive products you no longer sell, or import fewer.`,
    );
  }
}
