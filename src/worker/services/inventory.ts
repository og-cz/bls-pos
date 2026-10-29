import { and, desc, eq, lt, sql } from 'drizzle-orm';

import { hasRole } from '@shared/roles';
import type {
  DeductInput,
  MovementDto,
  MovementQuery,
  RestockInput,
} from '@shared/schemas/inventory';

import type { Db } from '../db/client';
import { newId } from '../db/id';
import { products, stockMovements, users } from '../db/schema';
import type { Actor } from '../lib/actor';
import { ApiError } from '../lib/errors';
import { auditInsert } from './audit';

function isCheckViolation(err: unknown): boolean {
  const text = String(err instanceof Error && err.cause ? err.cause : err);
  return text.includes('CHECK constraint failed');
}

/**
 * Moves stock by `delta` and logs who, how many and why, in one batch (Section 1.2).
 * The products CHECK makes the whole batch fail if tracked stock would go below zero.
 */
async function moveStock(
  db: Db,
  shopId: string,
  actor: Actor,
  input: {
    productId: string;
    delta: number;
    reason: 'restock' | DeductInput['reason'];
    note?: string | undefined;
  },
  now: number,
): Promise<{ productId: string; stock: number }> {
  const product = await db
    .select({
      name: products.name,
      trackStock: products.trackStock,
      archivedAt: products.archivedAt,
    })
    .from(products)
    .where(and(eq(products.id, input.productId), eq(products.shopId, shopId)))
    .get();
  if (!product || product.archivedAt !== null) {
    throw new ApiError(404, 'NOT_FOUND', 'No such product in this shop.');
  }
  if (!product.trackStock) {
    throw new ApiError(409, 'STOCK_NOT_TRACKED', `${product.name} doesn't track stock.`);
  }

  const where = and(
    eq(products.id, input.productId),
    eq(products.shopId, shopId),
    eq(products.trackStock, true),
  );
  try {
    const [updated] = await db.batch([
      db
        .update(products)
        .set({ stock: sql`${products.stock} + ${input.delta}`, updatedAt: now })
        .where(where)
        .returning({ stock: products.stock }),
      db.insert(stockMovements).values({
        id: newId(now),
        shopId,
        productId: input.productId,
        userId: actor.userId,
        delta: input.delta,
        reason: input.reason,
        note: input.note ?? null,
        createdAt: now,
      }),
      auditInsert(
        db,
        shopId,
        {
          action: input.delta > 0 ? 'stock.restock' : 'stock.deduct',
          userId: actor.userId,
          target: { type: 'product', id: input.productId },
          details: { name: product.name, delta: input.delta, reason: input.reason },
          ipHash: actor.ipHash,
        },
        now,
      ),
    ]);
    const stock = updated[0]?.stock;
    if (stock === undefined)
      throw new ApiError(409, 'STOCK_NOT_TRACKED', 'Stock changed, try again.');
    return { productId: input.productId, stock };
  } catch (err) {
    if (isCheckViolation(err)) {
      throw new ApiError(409, 'STOCK_INSUFFICIENT', `Not enough stock for ${product.name}.`);
    }
    throw err;
  }
}

export function restock(
  db: Db,
  shopId: string,
  actor: Actor,
  input: RestockInput,
  now: number = Date.now(),
) {
  return moveStock(db, shopId, actor, { ...input, delta: input.quantity, reason: 'restock' }, now);
}

export function deduct(
  db: Db,
  shopId: string,
  actor: Actor,
  input: DeductInput,
  now: number = Date.now(),
) {
  return moveStock(db, shopId, actor, { ...input, delta: -input.quantity }, now);
}

/** Newest first. Admins see everything; staff see only their own movements (Section 5.2). */
export async function listMovements(
  db: Db,
  shopId: string,
  actor: Actor,
  query: MovementQuery,
): Promise<{ movements: MovementDto[]; nextCursor: string | null }> {
  const rows = await db
    .select({
      id: stockMovements.id,
      productId: stockMovements.productId,
      productName: products.name,
      userId: stockMovements.userId,
      displayName: users.displayName,
      delta: stockMovements.delta,
      reason: stockMovements.reason,
      note: stockMovements.note,
      createdAt: stockMovements.createdAt,
    })
    .from(stockMovements)
    .innerJoin(
      products,
      and(eq(products.id, stockMovements.productId), eq(products.shopId, stockMovements.shopId)),
    )
    .innerJoin(
      users,
      and(eq(users.id, stockMovements.userId), eq(users.shopId, stockMovements.shopId)),
    )
    .where(
      and(
        eq(stockMovements.shopId, shopId),
        hasRole(actor.role, 'admin') ? undefined : eq(stockMovements.userId, actor.userId),
        query.productId ? eq(stockMovements.productId, query.productId) : undefined,
        query.cursor ? lt(stockMovements.id, query.cursor) : undefined,
      ),
    )
    .orderBy(desc(stockMovements.id))
    .limit(query.limit + 1);

  const page = rows.slice(0, query.limit);
  return {
    movements: page.map((r) => ({
      id: r.id,
      product: { id: r.productId, name: r.productName },
      user: { id: r.userId, displayName: r.displayName },
      delta: r.delta,
      reason: r.reason,
      note: r.note,
      createdAt: r.createdAt,
    })),
    nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
  };
}
