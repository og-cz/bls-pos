import { Hono } from 'hono';

import { deductSchema, movementQuerySchema, restockSchema } from '@shared/schemas/inventory';

import { getDb } from '../db/client';
import type { AuthedEnv } from '../env';
import { actorOf } from '../lib/actor';
import { ApiError } from '../lib/errors';
import { parseJson } from '../lib/validate';
import { requireRole } from '../middleware/role';
import { authed } from '../middleware/tenant';
import { deduct, listMovements, restock } from '../services/inventory';

export const inventoryRoutes = new Hono<AuthedEnv>();

inventoryRoutes.use(...authed);

inventoryRoutes.post('/restock', requireRole('admin'), async (c) => {
  const input = await parseJson(c, restockSchema);
  return c.json(await restock(getDb(c.env.DB), c.var.shopId, await actorOf(c), input));
});

// Staff can take stock out (damaged, expired, used, lost), always with a reason.
inventoryRoutes.post('/deduct', async (c) => {
  const input = await parseJson(c, deductSchema);
  return c.json(await deduct(getDb(c.env.DB), c.var.shopId, await actorOf(c), input));
});

inventoryRoutes.get('/movements', async (c) => {
  const query = movementQuerySchema.safeParse(c.req.query());
  if (!query.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid filter or paging.');
  return c.json(await listMovements(getDb(c.env.DB), c.var.shopId, await actorOf(c), query.data));
});
