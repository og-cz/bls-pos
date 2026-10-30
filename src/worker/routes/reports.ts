import { Hono } from 'hono';
import type { z } from 'zod';

import {
  closeDaySchema,
  dailyCloseQuerySchema,
  dashboardQuerySchema,
  incomeQuerySchema,
  reportRangeSchema,
  topProductsQuerySchema,
} from '@shared/schemas/reports';

import { getDb } from '../db/client';
import type { AuthedEnv } from '../env';
import { actorOf } from '../lib/actor';
import { ApiError } from '../lib/errors';
import { parseJson } from '../lib/validate';
import { requireRole } from '../middleware/role';
import { authed } from '../middleware/tenant';
import { closeDay, getDailyClose } from '../services/closings';
import { dashboard, incomeReport, salesByStaff, topProducts } from '../services/reports';

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

reportRoutes.get('/dashboard', async (c) => {
  const { days } = parseQuery(c.req.query(), dashboardQuerySchema);
  return c.json(await dashboard(getDb(c.env.DB), c.var.shopId, days));
});

// Z-reading: view a day's close (or its live numbers), and close it (Section 7.16).
reportRoutes.get('/daily-close', async (c) => {
  const { day } = parseQuery(c.req.query(), dailyCloseQuerySchema);
  return c.json(await getDailyClose(getDb(c.env.DB), c.var.shopId, day));
});

reportRoutes.post('/daily-close', async (c) => {
  const { day } = await parseJson(c, closeDaySchema);
  const closing = await closeDay(getDb(c.env.DB), c.var.shopId, await actorOf(c), day);
  return c.json({ closing }, 201);
});

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
