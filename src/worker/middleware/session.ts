import { createMiddleware } from 'hono/factory';

import { getDb } from '../db/client';
import type { AppEnv, AuthedEnv } from '../env';
import { clearSessionCookie, readSessionCookie } from '../lib/cookies';
import { ApiError } from '../lib/errors';
import { resolveSession } from '../services/sessions';

/** Loads the session from the cookie, if any. Never trusts anything else the client sends. */
export const session = createMiddleware<AppEnv>(async (c, next) => {
  const token = readSessionCookie(c);
  const auth = token ? await resolveSession(getDb(c.env.DB), token) : null;
  if (token && !auth) clearSessionCookie(c);
  c.set('auth', auth);
  await next();
});

export const requireAuth = createMiddleware<AuthedEnv>(async (c, next) => {
  // `session` runs first, so `auth` is set (possibly to null).
  if (!(c.var.auth as AuthedEnv['Variables']['auth'] | null)) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Please log in.');
  }
  await next();
});
