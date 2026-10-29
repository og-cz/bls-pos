import { Hono } from 'hono';

import { signupSchema } from '@shared/schemas/auth';

import { getDb } from '../db/client';
import type { AppEnv } from '../env';
import { parseJson } from '../lib/validate';
import { createShopWithOwner } from '../services/signup';

export const authRoutes = new Hono<AppEnv>();

authRoutes.post('/signup', async (c) => {
  const input = await parseJson(c, signupSchema);
  const result = await createShopWithOwner(getDb(c.env.DB), c.env.PEPPER, input);
  return c.json(result, 201);
});
