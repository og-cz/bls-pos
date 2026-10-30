import { Hono } from 'hono';
import { z } from 'zod';

import { getDb } from '../db/client';
import type { AuthedEnv } from '../env';
import { EXPORT_FORMATS, EXPORT_KINDS } from '@shared/export';

import { actorOf } from '../lib/actor';
import { ApiError } from '../lib/errors';
import { parseJson } from '../lib/validate';
import { requireRole } from '../middleware/role';
import { authed } from '../middleware/tenant';
import { AUDIT_PAGE_MAX, listAudit, writeAudit } from '../services/audit';

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

// Exports are built in the browser (no 10 ms CPU limit there); this records them.
const exportSchema = z
  .object({
    kind: z.enum(EXPORT_KINDS),
    format: z.enum(EXPORT_FORMATS),
    rows: z.number().int().min(0).max(1_000_000),
  })
  .strict();

auditRoutes.post('/exports', async (c) => {
  const input = await parseJson(c, exportSchema);
  const actor = await actorOf(c);
  await writeAudit(getDb(c.env.DB), c.var.shopId, {
    action: 'data.export',
    userId: actor.userId,
    details: input,
    ipHash: actor.ipHash,
  });
  return c.json({ ok: true });
});
