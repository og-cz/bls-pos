import { Hono } from 'hono';
import { z } from 'zod';

import { getDb } from '../db/client';
import type { AuthedEnv } from '../env';
import { ApiError } from '../lib/errors';
import { requireRole } from '../middleware/role';
import { authed } from '../middleware/tenant';
import { AUDIT_PAGE_MAX, listAudit } from '../services/audit';

export const auditRoutes = new Hono<AuthedEnv>();

// Staff never see the audit log (Section 7.4).
auditRoutes.use(...authed, requireRole('admin'));

const querySchema = z
  .object({
    cursor: z.string().max(64).optional(),
    limit: z.coerce.number().int().min(1).max(AUDIT_PAGE_MAX).default(50),
  })
  .strict();

auditRoutes.get('/', async (c) => {
  const query = querySchema.safeParse(c.req.query());
  if (!query.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid cursor or limit.');
  return c.json(await listAudit(getDb(c.env.DB), c.var.shopId, query.data));
});
