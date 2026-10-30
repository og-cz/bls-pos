import type { MiddlewareHandler } from 'hono';

/**
 * Security headers on every API response (Section 7.6). The API only returns JSON and
 * images, so its policy allows nothing to run or embed. The web app's own headers are
 * in public/_headers.
 */
export const API_SECURITY_HEADERS: Record<string, string> = {
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'x-frame-options': 'DENY',
};

export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  for (const [name, value] of Object.entries(API_SECURITY_HEADERS)) {
    c.res.headers.set(name, value);
  }
  // Private data must never sit in a shared cache. Public pages set their own.
  if (!c.res.headers.has('cache-control')) c.res.headers.set('cache-control', 'no-store');
};
