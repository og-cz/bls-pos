import { Hono, type Context } from 'hono';

import { loginSchema, signupSchema } from '@shared/schemas/auth';

import { getDb } from '../db/client';
import type { AppEnv, AuthedEnv } from '../env';
import { clearSessionCookie, writeSessionCookie } from '../lib/cookies';
import { parseJson } from '../lib/validate';
import { requireAuth } from '../middleware/session';
import { hashIp } from '../security/tokens';
import { login } from '../services/login';
import { createSession, revokeSession } from '../services/sessions';
import { createShopWithOwner } from '../services/signup';

export const authRoutes = new Hono<AppEnv>();

async function startSession(c: Context<AppEnv>, shopId: string, userId: string) {
  const ip = c.req.header('cf-connecting-ip');
  const { token, expiresAt } = await createSession(getDb(c.env.DB), shopId, userId, {
    userAgent: c.req.header('user-agent') ?? null,
    ipHash: ip ? await hashIp(ip, c.env.PEPPER) : null,
  });
  writeSessionCookie(c, token, expiresAt);
}

authRoutes.post('/signup', async (c) => {
  const input = await parseJson(c, signupSchema);
  const result = await createShopWithOwner(getDb(c.env.DB), c.env.PEPPER, input);
  await startSession(c, result.shop.id, result.user.id);
  return c.json(result, 201);
});

authRoutes.post('/login', async (c) => {
  const input = await parseJson(c, loginSchema);
  const result = await login(getDb(c.env.DB), c.env.PEPPER, input);
  await startSession(c, result.shopId, result.userId);
  return c.json({ ok: true, role: result.role });
});

authRoutes.post('/logout', requireAuth, async (c: Context<AuthedEnv>) => {
  const { shopId, sessionId } = c.var.auth;
  await revokeSession(getDb(c.env.DB), shopId, sessionId);
  clearSessionCookie(c);
  return c.json({ ok: true });
});
