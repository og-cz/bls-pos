import type { StorageAdapter } from '../adapters/types';

// Media keys are random and never reused, so the bytes behind a key never change. A copy
// kept in this Cloudflare location's cache means most views never touch the database.
// Callers check access *before* calling this; the cache only skips the storage read.
const CACHE_ORIGIN = 'https://media.cache.internal/';
const EDGE_CACHE_SECONDS = 24 * 60 * 60;

function cacheRequest(key: string): Request {
  return new Request(CACHE_ORIGIN + encodeURIComponent(key));
}

/** Returns the stored image with the given browser Cache-Control, or null if it's gone. */
export async function serveMedia(
  storage: StorageAdapter,
  key: string,
  browserCacheControl: string,
  ctx?: { waitUntil(promise: Promise<unknown>): void },
): Promise<Response | null> {
  const cache = (caches as unknown as { default: Cache }).default;
  let res = await cache.match(cacheRequest(key));

  if (!res) {
    const obj = await storage.get(key);
    if (!obj) return null;
    res = new Response(obj.body, {
      headers: {
        'content-type': obj.contentType,
        'content-length': String(obj.size),
        'cache-control': `public, max-age=${EDGE_CACHE_SECONDS}`,
      },
    });
    const put = cache.put(cacheRequest(key), res.clone());
    if (ctx) ctx.waitUntil(put);
    else await put;
  }

  return new Response(res.body, {
    headers: {
      'content-type': res.headers.get('content-type') ?? 'application/octet-stream',
      'content-length': res.headers.get('content-length') ?? '',
      'x-content-type-options': 'nosniff',
      'content-disposition': 'inline',
      'cache-control': browserCacheControl,
    },
  });
}

/** Drops this location's cached copy after an image is replaced or removed. */
export async function forgetCachedMedia(key: string): Promise<void> {
  const cache = (caches as unknown as { default: Cache }).default;
  await cache.delete(cacheRequest(key));
}
