import { Hono } from 'hono';

import { R2Storage } from '../adapters/storage/r2';
import { getDb } from '../db/client';
import type { AuthedEnv } from '../env';
import { actorOf } from '../lib/actor';
import { ApiError } from '../lib/errors';
import { shopPrefix } from '../lib/media';
import { authed } from '../middleware/tenant';
import { UPLOAD_KINDS, uploadImage, type UploadKind } from '../services/uploads';

export const uploadRoutes = new Hono<AuthedEnv>();
export const mediaRoutes = new Hono<AuthedEnv>();

uploadRoutes.use(...authed);
mediaRoutes.use(...authed);

// Raw image bytes in the body, type in Content-Type. Role rules are in the service:
// avatars are for everyone (their own), the rest for admins and the owner.
uploadRoutes.post('/:kind', async (c) => {
  const kind = c.req.param('kind');
  if (!(UPLOAD_KINDS as readonly string[]).includes(kind)) {
    throw new ApiError(404, 'NOT_FOUND', 'Not found');
  }
  const result = await uploadImage(
    getDb(c.env.DB),
    c.var.shopId,
    new R2Storage(c.env.MEDIA),
    await actorOf(c),
    {
      kind: kind as UploadKind,
      data: await c.req.arrayBuffer(),
      declaredType: c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase(),
      productId: c.req.query('productId'),
    },
  );
  return c.json(result, 201);
});

// Images are private to the shop for now; the public storefront opens some of them up in
// Phase 6. Another shop's key answers 404, like a key that doesn't exist.
mediaRoutes.get('/*', async (c) => {
  const key = c.req.path.replace(/^.*?\/media\//, '');
  if (!key.startsWith(shopPrefix(c.var.shopId)) || key.includes('..')) {
    throw new ApiError(404, 'NOT_FOUND', 'Not found');
  }
  const obj = await new R2Storage(c.env.MEDIA).get(key);
  if (!obj) throw new ApiError(404, 'NOT_FOUND', 'Not found');
  return new Response(obj.body, {
    headers: {
      'content-type': obj.contentType,
      'content-length': String(obj.size),
      'x-content-type-options': 'nosniff',
      'content-disposition': 'inline',
      // Keys are random and never reused, so the bytes behind a key never change.
      'cache-control': 'private, max-age=31536000, immutable',
    },
  });
});
