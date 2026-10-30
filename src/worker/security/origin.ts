import type { MiddlewareHandler } from 'hono';

import { ApiError } from '../lib/errors';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF guard (Section 7.7), on top of the SameSite=Lax cookie: a request that changes
 * something must come from this site. Browsers always send Origin (or Sec-Fetch-Site) on
 * such requests, so another site's form or script is refused. Requests with neither come
 * from non-browser tools, which can't carry a visitor's cookie, so they pass.
 */
export const sameOrigin: MiddlewareHandler = async (c, next) => {
  if (!SAFE.has(c.req.method)) {
    const origin = c.req.header('origin');
    const site = c.req.header('sec-fetch-site');
    const own = new URL(c.req.url).origin;
    const crossOrigin =
      (origin !== undefined && origin !== own) ||
      (origin === undefined && site !== undefined && site !== 'same-origin' && site !== 'none');
    if (crossOrigin) {
      throw new ApiError(403, 'CROSS_ORIGIN', 'This request must come from the bls POS app.');
    }
  }
  await next();
};
