import { and, count, eq, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';

import { entitlementsFor } from '@shared/entitlements';
import { hasRole, type Role } from '@shared/roles';
import {
  stockStatus,
  type CreateProductInput,
  type ProductDto,
  type ProductQuery,
  type UpdateProductInput,
} from '@shared/schemas/products';

import type { Db } from '../db/client';
import { isUniqueViolation } from '../db/errors';
import { newId } from '../db/id';
import { categories, products, shops, stockMovements, type Product } from '../db/schema';
import type { Actor } from '../lib/actor';
import { ApiError } from '../lib/errors';
import { mediaUrl, thumbKeyFor } from '../lib/media';
import { auditInsert } from './audit';

/** Staff never receive cost (Section 7.4): the key is left out, not just emptied. */
function toProductDto(row: Product, role: Role): ProductDto {
  const dto: ProductDto = {
    id: row.id,
    name: row.name,
    sku: row.sku,
    priceCents: row.priceCents,
    categoryId: row.categoryId,
    trackStock: row.trackStock,
    stock: row.stock,
    lowStockThreshold: row.lowStockThreshold,
    stockStatus: stockStatus(row),
    showOnStorefront: row.showOnStorefront,
    archived: row.archivedAt !== null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    imageUrl: row.imageKey ? mediaUrl(row.imageKey) : null,
    thumbUrl: row.imageKey ? mediaUrl(thumbKeyFor(row.imageKey)) : null,
  };
  if (hasRole(role, 'admin')) dto.costCents = row.costCents;
  return dto;
}

// Cursor = the last row's (lowercased name, id), so paging follows the A–Z order.
type Cursor = { n: string; i: string };

function encodeCursor(row: Product): string {
  return btoa(encodeURIComponent(JSON.stringify({ n: row.name.toLowerCase(), i: row.id })));
}

function decodeCursor(raw: string): Cursor {
  try {
    const value = JSON.parse(decodeURIComponent(atob(raw))) as Partial<Cursor>;
    if (typeof value.n === 'string' && typeof value.i === 'string') return value as Cursor;
  } catch {
    // fall through
  }
  throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid cursor.');
}

export async function listProducts(
  db: Db,
  shopId: string,
  role: Role,
  query: ProductQuery,
): Promise<{ products: ProductDto[]; nextCursor: string | null }> {
  // Archived products are an admin view; staff only ever see what they can sell.
  const archived = query.archived === 'true' && hasRole(role, 'admin');
  const where: (SQL | undefined)[] = [
    eq(products.shopId, shopId),
    archived ? isNotNull(products.archivedAt) : isNull(products.archivedAt),
    query.categoryId ? eq(products.categoryId, query.categoryId) : undefined,
    query.stock ? eq(products.trackStock, true) : undefined,
    query.stock === 'out' ? sql`${products.stock} <= 0` : undefined,
    query.stock === 'low' ? sql`${products.stock} <= ${products.lowStockThreshold}` : undefined,
  ];
  if (query.q) {
    // instr() instead of LIKE, so % and _ typed by the user are plain characters.
    where.push(
      sql`(instr(lower(${products.name}), lower(${query.q})) > 0 OR lower(${products.sku}) = lower(${query.q}))`,
    );
  }
  if (query.cursor) {
    const c = decodeCursor(query.cursor);
    where.push(sql`(lower(${products.name}), ${products.id}) > (${c.n}, ${c.i})`);
  }

  const rows = await db
    .select()
    .from(products)
    .where(and(...where))
    .orderBy(sql`lower(${products.name})`, products.id)
    .limit(query.limit + 1);

  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    products: page.map((r) => toProductDto(r, role)),
    nextCursor: rows.length > query.limit && last ? encodeCursor(last) : null,
  };
}

async function findProduct(db: Db, shopId: string, id: string): Promise<Product> {
  const row = await db
    .select()
    .from(products)
    .where(and(eq(products.id, id), eq(products.shopId, shopId)))
    .get();
  // Another shop's product looks exactly like one that doesn't exist.
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'No such product in this shop.');
  return row;
}

export async function getProduct(
  db: Db,
  shopId: string,
  role: Role,
  id: string,
): Promise<ProductDto> {
  const row = await findProduct(db, shopId, id);
  if (row.archivedAt !== null && !hasRole(role, 'admin')) {
    throw new ApiError(404, 'NOT_FOUND', 'No such product in this shop.');
  }
  return toProductDto(row, role);
}

/** A category id from the client must belong to this shop. */
async function checkCategory(db: Db, shopId: string, categoryId: string | null | undefined) {
  if (!categoryId) return;
  const found = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.shopId, shopId)))
    .get();
  if (!found) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Some fields need fixing.', {
      categoryId: 'Unknown category.',
    });
  }
}

/** Archived products don't count, so archiving makes room (plan's maxProducts). */
async function checkProductLimit(db: Db, shopId: string) {
  const shop = await db.select({ plan: shops.plan }).from(shops).where(eq(shops.id, shopId)).get();
  if (!shop) throw new ApiError(404, 'NOT_FOUND', 'Shop not found.');
  const { maxProducts } = entitlementsFor(shop.plan);
  const current = await db
    .select({ n: count() })
    .from(products)
    .where(and(eq(products.shopId, shopId), isNull(products.archivedAt)))
    .get();
  if ((current?.n ?? 0) >= maxProducts) {
    throw new ApiError(
      409,
      'PRODUCT_LIMIT_REACHED',
      `Your plan allows up to ${maxProducts} products. Archive ones you no longer sell to add more.`,
    );
  }
}

const SKU_TAKEN = () =>
  new ApiError(409, 'SKU_TAKEN', 'Another product already uses that SKU.', {
    sku: 'Already used by another product.',
  });

export async function createProduct(
  db: Db,
  shopId: string,
  actor: Actor,
  input: CreateProductInput,
  now: number = Date.now(),
): Promise<ProductDto> {
  await checkCategory(db, shopId, input.categoryId);

  await checkProductLimit(db, shopId);

  const trackStock = input.trackStock ?? true;
  const stock = trackStock ? (input.stock ?? 0) : 0;
  const row: Product = {
    id: newId(now),
    shopId,
    categoryId: input.categoryId ?? null,
    name: input.name,
    sku: input.sku ?? null,
    priceCents: input.priceCents,
    costCents: input.costCents ?? null,
    trackStock,
    stock,
    lowStockThreshold: input.lowStockThreshold ?? 5,
    imageKey: null,
    showOnStorefront: input.showOnStorefront ?? true,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await db.batch([
      db.insert(products).values(row),
      // Opening stock is logged like any other stock change.
      ...(stock > 0
        ? [
            db.insert(stockMovements).values({
              id: newId(now),
              shopId,
              productId: row.id,
              userId: actor.userId,
              delta: stock,
              reason: 'restock' as const,
              note: 'Opening stock',
              createdAt: now,
            }),
          ]
        : []),
      auditInsert(
        db,
        shopId,
        {
          action: 'product.create',
          userId: actor.userId,
          target: { type: 'product', id: row.id },
          details: { name: row.name, priceCents: row.priceCents, stock },
          ipHash: actor.ipHash,
        },
        now,
      ),
    ]);
  } catch (err) {
    if (isUniqueViolation(err, 'products.sku')) throw SKU_TAKEN();
    throw err;
  }
  return toProductDto(row, actor.role);
}

const EDITABLE = [
  'name',
  'sku',
  'priceCents',
  'costCents',
  'categoryId',
  'trackStock',
  'lowStockThreshold',
  'showOnStorefront',
] as const;

export async function updateProduct(
  db: Db,
  shopId: string,
  actor: Actor,
  id: string,
  input: UpdateProductInput,
  now: number = Date.now(),
): Promise<ProductDto> {
  const before = await findProduct(db, shopId, id);
  await checkCategory(db, shopId, input.categoryId);

  const changes: Partial<Product> = {};
  for (const key of EDITABLE) {
    const value = input[key];
    if (value !== undefined && value !== before[key]) Object.assign(changes, { [key]: value });
  }
  if (Object.keys(changes).length === 0) return toProductDto(before, actor.role);

  // The audit entry names what changed; price changes keep the old and new value.
  const details: Record<string, unknown> = { name: changes.name ?? before.name };
  details.changed = Object.keys(changes);
  if (changes.priceCents !== undefined) {
    details.priceFrom = before.priceCents;
    details.priceTo = changes.priceCents;
  }

  try {
    await db.batch([
      db
        .update(products)
        .set({ ...changes, updatedAt: now })
        .where(and(eq(products.id, id), eq(products.shopId, shopId))),
      auditInsert(
        db,
        shopId,
        {
          action: 'product.update',
          userId: actor.userId,
          target: { type: 'product', id },
          details,
          ipHash: actor.ipHash,
        },
        now,
      ),
    ]);
  } catch (err) {
    if (isUniqueViolation(err, 'products.sku')) throw SKU_TAKEN();
    throw err;
  }
  return toProductDto({ ...before, ...changes, updatedAt: now }, actor.role);
}

/** "Remove product" = archive (Section 4): it leaves the sell screen but keeps its history. */
export async function setArchived(
  db: Db,
  shopId: string,
  actor: Actor,
  id: string,
  archived: boolean,
  now: number = Date.now(),
): Promise<ProductDto> {
  const before = await findProduct(db, shopId, id);
  if ((before.archivedAt !== null) === archived) return toProductDto(before, actor.role);
  if (!archived) await checkProductLimit(db, shopId);

  const archivedAt = archived ? now : null;
  await db.batch([
    db
      .update(products)
      .set({ archivedAt, updatedAt: now })
      .where(and(eq(products.id, id), eq(products.shopId, shopId))),
    auditInsert(
      db,
      shopId,
      {
        action: archived ? 'product.archive' : 'product.unarchive',
        userId: actor.userId,
        target: { type: 'product', id },
        details: { name: before.name },
        ipHash: actor.ipHash,
      },
      now,
    ),
  ]);
  return toProductDto({ ...before, archivedAt, updatedAt: now }, actor.role);
}
