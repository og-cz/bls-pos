import { Hono } from 'hono';

import { mediaStorage } from '../adapters/storage';
import { getDb } from '../db/client';
import type { AppEnv } from '../env';
import { ApiError } from '../lib/errors';
import { serveMedia } from '../lib/serve-media';
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
  // Short for browsers, so an image taken off the page stops showing soon. The check
  // above runs on every request, so the edge copy never outlives the image being public.
  const res = await serveMedia(mediaStorage(c.env), key, 'public, max-age=60', c.executionCtx);
  if (!res) throw notFound();
  return res;
});
