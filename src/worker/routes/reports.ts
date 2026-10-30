import { Hono } from 'hono';
import type { z } from 'zod';

import {
  incomeQuerySchema,
  reportRangeSchema,
  topProductsQuerySchema,
} from '@shared/schemas/reports';

import { getDb } from '../db/client';
import type { AuthedEnv } from '../env';
import { ApiError } from '../lib/errors';
import { requireRole } from '../middleware/role';
import { authed } from '../middleware/tenant';
import { incomeReport, salesByStaff, topProducts } from '../services/reports';

export const reportRoutes = new Hono<AuthedEnv>();

// Reports show cost and profit, so they are for admins and the owner (Section 5.6).
reportRoutes.use(...authed, requireRole('admin'));

function parseQuery<T extends z.ZodType>(query: Record<string, string>, schema: T): z.output<T> {
  const result = schema.safeParse(query);
  if (!result.success) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      result.error.issues[0]?.message ?? 'Invalid range.',
    );
  }
  return result.data;
}

reportRoutes.get('/income', async (c) => {
  const query = parseQuery(c.req.query(), incomeQuerySchema);
  return c.json(await incomeReport(getDb(c.env.DB), c.var.shopId, query));
});

reportRoutes.get('/top-products', async (c) => {
  const query = parseQuery(c.req.query(), topProductsQuerySchema);
  return c.json({ products: await topProducts(getDb(c.env.DB), c.var.shopId, query) });
});

reportRoutes.get('/by-staff', async (c) => {
  const range = parseQuery(c.req.query(), reportRangeSchema);
  return c.json({ staff: await salesByStaff(getDb(c.env.DB), c.var.shopId, range) });
});
