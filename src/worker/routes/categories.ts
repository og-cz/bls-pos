import { Hono } from 'hono';

import { categorySchema, updateCategorySchema } from '@shared/schemas/categories';

import { getDb } from '../db/client';
import type { AuthedEnv } from '../env';
import { actorOf } from '../lib/actor';
import { parseJson } from '../lib/validate';
import { requireRole } from '../middleware/role';
import { authed } from '../middleware/tenant';
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from '../services/categories';

export const categoryRoutes = new Hono<AuthedEnv>();

categoryRoutes.use(...authed);

// Read: everyone (category chips on the sell screen). Write: admins and the owner.
categoryRoutes.get('/', async (c) => {
  return c.json({ categories: await listCategories(getDb(c.env.DB), c.var.shopId) });
});

categoryRoutes.post('/', requireRole('admin'), async (c) => {
  const input = await parseJson(c, categorySchema);
  const category = await createCategory(getDb(c.env.DB), c.var.shopId, await actorOf(c), input);
  return c.json({ category }, 201);
});

categoryRoutes.patch('/:id', requireRole('admin'), async (c) => {
  const input = await parseJson(c, updateCategorySchema);
  const category = await updateCategory(
    getDb(c.env.DB),
    c.var.shopId,
    await actorOf(c),
    c.req.param('id'),
    input,
  );
  return c.json({ category });
});

categoryRoutes.delete('/:id', requireRole('admin'), async (c) => {
  await deleteCategory(getDb(c.env.DB), c.var.shopId, await actorOf(c), c.req.param('id'));
  return c.json({ ok: true });
});
