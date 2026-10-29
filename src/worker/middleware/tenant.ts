import { createMiddleware } from 'hono/factory';

import type { AuthedEnv } from '../env';
import { requireAuth } from './session';

/**
 * Sets `c.var.shopId` from the session (Section 5.1 step 5, 7.4). The shop never comes
 * from the URL, body or query: whatever shop id a client sends is simply ignored.
 */
export const tenant = createMiddleware<AuthedEnv>(async (c, next) => {
  c.set('shopId', c.var.auth.shopId);
  await next();
});

/** Every signed-in route: a live session, then its shop. Use as `.use(...authed)`. */
export const authed = [requireAuth, tenant] as const;
