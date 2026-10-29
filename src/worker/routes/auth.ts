import { Hono, type Context } from 'hono';

import { loginSchema, signupSchema } from '@shared/schemas/auth';

import { getDb } from '../db/client';
import type { AppEnv, AuthedEnv } from '../env';
import { clearSessionCookie, writeSessionCookie } from '../lib/cookies';
import { parseJson } from '../lib/validate';
import { requireAuth } from '../middleware/session';
import { hashIp } from '../security/tokens';
import { requireHuman } from '../security/turnstile';
import { login, TooManyAttemptsError } from '../services/login';
import { createSession, revokeSession } from '../services/sessions';
import { createShopWithOwner } from '../services/signup';

export const authRoutes = new Hono<AppEnv>();

async function clientIpHash(c: Context<AppEnv>): Promise<string | null> {
  const ip = c.req.header('cf-connecting-ip');
  return ip ? hashIp(ip, c.env.PEPPER) : null;
}

async function startSession(c: Context<AppEnv>, shopId: string, userId: string) {
  const { token, expiresAt } = await createSession(getDb(c.env.DB), shopId, userId, {
    userAgent: c.req.header('user-agent') ?? null,
    ipHash: await clientIpHash(c),
  });
  writeSessionCookie(c, token, expiresAt);
}

function verifyHuman(c: Context<AppEnv>, token: string | undefined) {
  return requireHuman(c.env.TURNSTILE_SECRET, token, c.req.header('cf-connecting-ip'));
}

authRoutes.post('/signup', async (c) => {
  const input = await parseJson(c, signupSchema);
  await verifyHuman(c, input.turnstileToken);
  const result = await createShopWithOwner(getDb(c.env.DB), c.env.PEPPER, input);
  await startSession(c, result.shop.id, result.user.id);
  return c.json(result, 201);
});

authRoutes.post('/login', async (c) => {
  const input = await parseJson(c, loginSchema);
  let result;
  try {
    result = await login(getDb(c.env.DB), c.env.PEPPER, input, {
      ipHash: await clientIpHash(c),
      verifyHuman: () => verifyHuman(c, input.turnstileToken),
    });
  } catch (err) {
    if (err instanceof TooManyAttemptsError) c.header('Retry-After', String(err.retryAfter));
    throw err;
  }
  await startSession(c, result.shopId, result.userId);
  return c.json({ ok: true, role: result.role });
});

authRoutes.post('/logout', requireAuth, async (c: Context<AuthedEnv>) => {
  const { shopId, sessionId } = c.var.auth;
  await revokeSession(getDb(c.env.DB), shopId, sessionId);
  clearSessionCookie(c);
  return c.json({ ok: true });
});
