import { Hono } from 'hono';

import { changeRoleSchema, createStaffSchema } from '@shared/schemas/staff';

import { getDb } from '../db/client';
import type { AuthedEnv } from '../env';
import { actorOf } from '../lib/actor';
import { parseJson } from '../lib/validate';
import { requireRole } from '../middleware/role';
import { authed } from '../middleware/tenant';
import {
  changeMemberRole,
  createStaff,
  deactivateMember,
  listMembers,
  resetMemberPassword,
} from '../services/staff';

export const staffRoutes = new Hono<AuthedEnv>();

staffRoutes.use(...authed, requireRole('admin'));

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

staffRoutes.post('/:id/reset-password', async (c) => {
  const db = getDb(c.env.DB);
  const result = await resetMemberPassword(
    db,
    c.var.shopId,
    c.env.PEPPER,
    await actorOf(c),
    c.req.param('id'),
  );
  return c.json(result);
});

staffRoutes.post('/:id/role', async (c) => {
  const { role } = await parseJson(c, changeRoleSchema);
  await changeMemberRole(getDb(c.env.DB), c.var.shopId, await actorOf(c), c.req.param('id'), role);
  return c.json({ role });
});
