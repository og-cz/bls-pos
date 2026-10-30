import { Hono } from 'hono';

import { createSaleSchema } from '@shared/schemas/sales';

import { getDb } from '../db/client';
import type { AuthedEnv } from '../env';
import { actorOf } from '../lib/actor';
import { parseJson } from '../lib/validate';
import { authed } from '../middleware/tenant';
import { createSale, getReceipt } from '../services/sales';

export const saleRoutes = new Hono<AuthedEnv>();

// Everyone in the shop sells; the service decides what each role may see.
saleRoutes.use(...authed);

saleRoutes.post('/', async (c) => {
  const input = await parseJson(c, createSaleSchema);
  const { receipt, replayed } = await createSale(
    getDb(c.env.DB),
    c.var.shopId,
    await actorOf(c),
    input,
  );
  // 200 for a replay of a sale already recorded, 201 for a new one.
  return c.json({ receipt, replayed }, replayed ? 200 : 201);
});

saleRoutes.get('/:id', async (c) => {
  const receipt = await getReceipt(
    getDb(c.env.DB),
    c.var.shopId,
    await actorOf(c),
    c.req.param('id'),
  );
  return c.json({ receipt });
});
