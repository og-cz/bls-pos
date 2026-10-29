import { Hono } from 'hono';

import { createStaffSchema } from '@shared/schemas/staff';

import { getDb } from '../db/client';
import type { AuthedEnv } from '../env';
import { parseJson } from '../lib/validate';
import { requireRole } from '../middleware/role';
import { authed } from '../middleware/tenant';
import { createStaff, deactivateMember, listMembers } from '../services/staff';

export const staffRoutes = new Hono<AuthedEnv>();

staffRoutes.use(...authed, requireRole('admin'));

staffRoutes.get('/', async (c) => {
  return c.json({ members: await listMembers(getDb(c.env.DB), c.var.shopId) });
});

staffRoutes.post('/', async (c) => {
  const input = await parseJson(c, createStaffSchema);
  const result = await createStaff(
    getDb(c.env.DB),
    c.var.shopId,
    c.env.PEPPER,
    c.var.auth.role,
    input,
  );
  return c.json(result, 201);
});

staffRoutes.post('/:id/deactivate', async (c) => {
  const { userId, role } = c.var.auth;
  const user = await deactivateMember(
    getDb(c.env.DB),
    c.var.shopId,
    { userId, role },
    c.req.param('id'),
  );
  return c.json({ user });
});
