import { Hono } from 'hono';

import { incomeQuerySchema } from '@shared/schemas/reports';

import { getDb } from '../db/client';
import type { AuthedEnv } from '../env';
import { ApiError } from '../lib/errors';
import { requireRole } from '../middleware/role';
import { authed } from '../middleware/tenant';
import { incomeReport } from '../services/reports';

export const reportRoutes = new Hono<AuthedEnv>();

// Reports show cost and profit, so they are for admins and the owner (Section 5.6).
reportRoutes.use(...authed, requireRole('admin'));

reportRoutes.get('/income', async (c) => {
  const query = incomeQuerySchema.safeParse(c.req.query());
  if (!query.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', query.error.issues[0]?.message ?? 'Invalid range.');
  }
  return c.json(await incomeReport(getDb(c.env.DB), c.var.shopId, query.data));
});
