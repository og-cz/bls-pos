import { Hono, type Context } from 'hono';

import { loginSchema, recoverSchema, signupSchema } from '@shared/schemas/auth';

import { getDb } from '../db/client';
import type { AppEnv, AuthedEnv } from '../env';
import { clearSessionCookie, writeSessionCookie } from '../lib/cookies';
import { clientIpHash } from '../lib/ip';
import { parseJson } from '../lib/validate';
import { authed } from '../middleware/tenant';
import { requireHuman } from '../security/turnstile';
import { login, TooManyAttemptsError } from '../services/login';
import { recoverAccount } from '../services/recovery';
import { createSession, revokeSession } from '../services/sessions';
import { createShopWithOwner } from '../services/signup';

export const authRoutes = new Hono<AppEnv>();

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
  const result = await createShopWithOwner(
    getDb(c.env.DB),
    c.env.PEPPER,
    input,
    await clientIpHash(c),
  );
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

authRoutes.post('/recover', async (c) => {
  const input = await parseJson(c, recoverSchema);
  await verifyHuman(c, input.turnstileToken);
  let result;
  try {
    result = await recoverAccount(getDb(c.env.DB), c.env.PEPPER, input, await clientIpHash(c));
  } catch (err) {
    if (err instanceof TooManyAttemptsError) c.header('Retry-After', String(err.retryAfter));
    throw err;
  }
  // All old sessions were revoked; this device gets a fresh one.
  await startSession(c, result.shopId, result.userId);
  return c.json({ ok: true, remainingCodes: result.remainingCodes });
});

authRoutes.post('/logout', ...authed, async (c: Context<AuthedEnv>) => {
  await revokeSession(getDb(c.env.DB), c.var.shopId, c.var.auth.sessionId);
  clearSessionCookie(c);
  return c.json({ ok: true });
});
