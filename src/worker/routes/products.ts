import { Hono } from 'hono';

import {
  createProductSchema,
  productQuerySchema,
  updateProductSchema,
} from '@shared/schemas/products';

import { getDb } from '../db/client';
import type { AuthedEnv } from '../env';
import { actorOf } from '../lib/actor';
import { ApiError } from '../lib/errors';
import { parseJson } from '../lib/validate';
import { requireRole } from '../middleware/role';
import { authed } from '../middleware/tenant';
import { createProduct, getProduct, listProducts, updateProduct } from '../services/products';

export const productRoutes = new Hono<AuthedEnv>();

productRoutes.use(...authed);

// Everyone can read products (staff need them to sell); only admins change them.
productRoutes.get('/', async (c) => {
  const query = productQuerySchema.safeParse(c.req.query());
  if (!query.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid search or paging.');
  return c.json(await listProducts(getDb(c.env.DB), c.var.shopId, c.var.auth.role, query.data));
});

productRoutes.get('/:id', async (c) => {
  const product = await getProduct(
    getDb(c.env.DB),
    c.var.shopId,
    c.var.auth.role,
    c.req.param('id'),
  );
  return c.json({ product });
});

productRoutes.post('/', requireRole('admin'), async (c) => {
  const input = await parseJson(c, createProductSchema);
  const product = await createProduct(getDb(c.env.DB), c.var.shopId, await actorOf(c), input);
  return c.json({ product }, 201);
});

productRoutes.patch('/:id', requireRole('admin'), async (c) => {
  const input = await parseJson(c, updateProductSchema);
  const product = await updateProduct(
    getDb(c.env.DB),
    c.var.shopId,
    await actorOf(c),
    c.req.param('id'),
    input,
  );
  return c.json({ product });
});
