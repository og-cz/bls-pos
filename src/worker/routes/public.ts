import { Hono } from 'hono';

import { R2Storage } from '../adapters/storage/r2';
import { getDb } from '../db/client';
import type { AppEnv } from '../env';
import { ApiError } from '../lib/errors';
import { getStorefront, isPublicImage } from '../services/storefront';

export const publicRoutes = new Hono<AppEnv>();

// No session here: anyone can open a shop page. Each visitor IP gets a fair share
// (wrangler.jsonc "ratelimits"), so nobody can hammer D1 through it.
publicRoutes.use('*', async (c, next) => {
  const ip = c.req.header('cf-connecting-ip') ?? 'local';
  const { success } = await c.env.PUBLIC_LIMITER.limit({ key: ip });
  if (!success) throw new ApiError(429, 'RATE_LIMITED', 'Too many requests. Try again soon.');
  await next();
});

const notFound = () => new ApiError(404, 'NOT_FOUND', 'This shop page is not available.');

publicRoutes.get('/s/:slug', async (c) => {
  const storefront = await getStorefront(getDb(c.env.DB), c.req.param('slug'));
  if (!storefront) throw notFound();
  // Cached at the edge for a minute (Section 9): changes show within 60 seconds.
  c.header('cache-control', 'public, max-age=60');
  return c.json({ storefront });
});

publicRoutes.get('/s/:slug/media/*', async (c) => {
  const slug = c.req.param('slug');
  const key = c.req.path.replace(/^.*?\/media\//, '');
  if (!(await isPublicImage(getDb(c.env.DB), slug, key))) throw notFound();
  const obj = await new R2Storage(c.env.MEDIA).get(key);
  if (!obj) throw notFound();
  return new Response(obj.body, {
    headers: {
      'content-type': obj.contentType,
      'content-length': String(obj.size),
      'x-content-type-options': 'nosniff',
      'content-disposition': 'inline',
      // Short, so an image taken off the page stops showing soon.
      'cache-control': 'public, max-age=60',
    },
  });
});
