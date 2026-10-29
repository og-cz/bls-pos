import { and, asc, eq, sql } from 'drizzle-orm';

import type { CategoryDto, CategoryInput, UpdateCategoryInput } from '@shared/schemas/categories';

import type { Db } from '../db/client';
import { isUniqueViolation } from '../db/errors';
import { newId } from '../db/id';
import { categories, products } from '../db/schema';
import type { Actor } from '../lib/actor';
import { ApiError } from '../lib/errors';
import { auditInsert } from './audit';

const columns = { id: categories.id, name: categories.name, sortOrder: categories.sortOrder };

const NAME_TAKEN = () =>
  new ApiError(409, 'CATEGORY_TAKEN', 'You already have a category with that name.', {
    name: 'Already used.',
  });

export async function listCategories(db: Db, shopId: string): Promise<CategoryDto[]> {
  return db
    .select(columns)
    .from(categories)
    .where(eq(categories.shopId, shopId))
    .orderBy(asc(categories.sortOrder), sql`lower(${categories.name})`);
}

async function findCategory(db: Db, shopId: string, id: string): Promise<CategoryDto> {
  const row = await db
    .select(columns)
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.shopId, shopId)))
    .get();
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'No such category in this shop.');
  return row;
}

export async function createCategory(
  db: Db,
  shopId: string,
  actor: Actor,
  input: CategoryInput,
  now: number = Date.now(),
): Promise<CategoryDto> {
  const row = { id: newId(now), shopId, name: input.name, sortOrder: input.sortOrder ?? 0 };
  try {
    await db.batch([
      db.insert(categories).values(row),
      auditInsert(
        db,
        shopId,
        {
          action: 'category.create',
          userId: actor.userId,
          target: { type: 'category', id: row.id },
          details: { name: row.name },
          ipHash: actor.ipHash,
        },
        now,
      ),
    ]);
  } catch (err) {
    if (isUniqueViolation(err, 'categories.')) throw NAME_TAKEN();
    throw err;
  }
  return { id: row.id, name: row.name, sortOrder: row.sortOrder };
}

export async function updateCategory(
  db: Db,
  shopId: string,
  actor: Actor,
  id: string,
  input: UpdateCategoryInput,
  now: number = Date.now(),
): Promise<CategoryDto> {
  const before = await findCategory(db, shopId, id);
  const after: CategoryDto = {
    id,
    name: input.name ?? before.name,
    sortOrder: input.sortOrder ?? before.sortOrder,
  };
  try {
    await db.batch([
      db
        .update(categories)
        .set({ name: after.name, sortOrder: after.sortOrder })
        .where(and(eq(categories.id, id), eq(categories.shopId, shopId))),
      auditInsert(
        db,
        shopId,
        {
          action: 'category.update',
          userId: actor.userId,
          target: { type: 'category', id },
          details: { name: after.name, from: before.name },
          ipHash: actor.ipHash,
        },
        now,
      ),
    ]);
  } catch (err) {
    if (isUniqueViolation(err, 'categories.')) throw NAME_TAKEN();
    throw err;
  }
  return after;
}

/** Removes a category. Its products stay and simply become uncategorized. */
export async function deleteCategory(
  db: Db,
  shopId: string,
  actor: Actor,
  id: string,
  now: number = Date.now(),
): Promise<void> {
  const before = await findCategory(db, shopId, id);
  await db.batch([
    db
      .update(products)
      .set({ categoryId: null, updatedAt: now })
      .where(and(eq(products.categoryId, id), eq(products.shopId, shopId))),
    db.delete(categories).where(and(eq(categories.id, id), eq(categories.shopId, shopId))),
    auditInsert(
      db,
      shopId,
      {
        action: 'category.delete',
        userId: actor.userId,
        target: { type: 'category', id },
        details: { name: before.name },
        ipHash: actor.ipHash,
      },
      now,
    ),
  ]);
}
