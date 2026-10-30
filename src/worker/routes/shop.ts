import { Hono } from 'hono';

import { themeSchema } from '@shared/theme';

import { getDb } from '../db/client';
import type { AuthedEnv } from '../env';
import { actorOf } from '../lib/actor';
import { parseJson } from '../lib/validate';
import { requireRole } from '../middleware/role';
import { authed } from '../middleware/tenant';
import { updateTheme } from '../services/shop';

export const shopRoutes = new Hono<AuthedEnv>();

shopRoutes.use(...authed);

// Branding is for admins and the owner (Section 6.4).
shopRoutes.patch('/theme', requireRole('admin'), async (c) => {
  const input = await parseJson(c, themeSchema);
  const theme = await updateTheme(getDb(c.env.DB), c.var.shopId, await actorOf(c), input);
  return c.json({ theme });
});
