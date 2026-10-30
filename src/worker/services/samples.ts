import { and, eq, inArray, isNull, like, sql } from 'drizzle-orm';

import { SAMPLE_PRODUCTS, SAMPLE_SKU_PREFIX } from '@shared/samples';

import type { Db } from '../db/client';
import { newId } from '../db/id';
import { categories, products, shops, stockMovements } from '../db/schema';
import type { Actor } from '../lib/actor';
import { ApiError } from '../lib/errors';
import { createProduct } from './products';

const isSample = like(products.sku, `${SAMPLE_SKU_PREFIX}%`);

/**
 * Adds sample products and their categories for the shop's kind (Section 8.1), so a new
 * owner can try a sale right away. Once per shop until they are removed.
 */
export async function addSampleProducts(
  db: Db,
  shopId: string,
  actor: Actor,
  now: number = Date.now(),
): Promise<{ added: number }> {
  const shop = await db
    .select({ businessType: shops.businessType })
    .from(shops)
    .where(eq(shops.id, shopId))
    .get();
  if (!shop) throw new ApiError(404, 'NOT_FOUND', 'Shop not found.');
  const existing = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.shopId, shopId), isSample))
    .get();
  if (existing) throw new ApiError(409, 'SAMPLES_EXIST', 'Sample products are already added.');

  const samples = SAMPLE_PRODUCTS[shop.businessType];
  const names = [...new Set(samples.map((s) => s.category))];
  // Categories the shop already has are reused.
  await db
    .insert(categories)
    .values(names.map((name, i) => ({ id: newId(now), shopId, name, sortOrder: i })))
    .onConflictDoNothing();
  const cats = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(and(eq(categories.shopId, shopId), inArray(categories.name, names)));
  const catId = new Map(cats.map((c) => [c.name, c.id]));

  let i = 0;
  for (const s of samples) {
    i += 1;
    await createProduct(
      db,
      shopId,
      actor,
      {
        name: s.name,
        sku: `${SAMPLE_SKU_PREFIX}${String(i)}`,
        priceCents: s.priceCents,
        costCents: s.costCents,
        categoryId: catId.get(s.category) ?? null,
        trackStock: s.stock !== null,
        stock: s.stock ?? 0,
      },
      now,
    );
  }
  return { added: samples.length };
}

/**
 * Removes the sample products. Ones never sold are deleted with their opening stock;
 * ones already sold are archived (their sales stay intact) and lose the SAMPLE- code.
 */
export async function removeSampleProducts(
  db: Db,
  shopId: string,
  now: number = Date.now(),
): Promise<{ removed: number }> {
  const rows = await db
    .select({
      id: products.id,
      // Table names spelled out: inside a subquery Drizzle would leave columns unqualified.
      sold: sql<number>`EXISTS (SELECT 1 FROM sale_items si WHERE si.product_id = products.id AND si.shop_id = ${shopId})`,
    })
    .from(products)
    .where(and(eq(products.shopId, shopId), isSample));
  if (rows.length === 0) return { removed: 0 };
  const unsold = rows.filter((r) => !r.sold).map((r) => r.id);
  const sold = rows.filter((r) => r.sold).map((r) => r.id);
  await db.batch([
    db
      .delete(stockMovements)
      .where(
        and(
          eq(stockMovements.shopId, shopId),
          inArray(stockMovements.productId, unsold.length ? unsold : ['']),
        ),
      ),
    db
      .delete(products)
      .where(and(eq(products.shopId, shopId), inArray(products.id, unsold.length ? unsold : ['']))),
    db
      .update(products)
      .set({ archivedAt: now, sku: null, updatedAt: now })
      .where(
        and(
          eq(products.shopId, shopId),
          inArray(products.id, sold.length ? sold : ['']),
          isNull(products.archivedAt),
        ),
      ),
    db
      .update(products)
      .set({ sku: null, updatedAt: now })
      .where(and(eq(products.shopId, shopId), inArray(products.id, sold.length ? sold : ['']))),
  ]);
  return { removed: rows.length };
}
