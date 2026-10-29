import { Hono, type Context } from 'hono';

import { createStaffSchema } from '@shared/schemas/staff';

import { getDb } from '../db/client';
import type { AuthedEnv } from '../env';
import { clientIpHash } from '../lib/ip';
import { parseJson } from '../lib/validate';
import { requireRole } from '../middleware/role';
import { authed } from '../middleware/tenant';
import { createStaff, deactivateMember, listMembers, type Actor } from '../services/staff';

export const staffRoutes = new Hono<AuthedEnv>();

staffRoutes.use(...authed, requireRole('admin'));

async function actorOf(c: Context<AuthedEnv>): Promise<Actor> {
  return { userId: c.var.auth.userId, role: c.var.auth.role, ipHash: await clientIpHash(c) };
}

staffRoutes.get('/', async (c) => {
  return c.json({ members: await listMembers(getDb(c.env.DB), c.var.shopId) });
});

staffRoutes.post('/', async (c) => {
  const input = await parseJson(c, createStaffSchema);
  const db = getDb(c.env.DB);
  const result = await createStaff(db, c.var.shopId, c.env.PEPPER, await actorOf(c), input);
  return c.json(result, 201);
});

staffRoutes.post('/:id/deactivate', async (c) => {
  const db = getDb(c.env.DB);
  const user = await deactivateMember(db, c.var.shopId, await actorOf(c), c.req.param('id'));
  return c.json({ user });
});
