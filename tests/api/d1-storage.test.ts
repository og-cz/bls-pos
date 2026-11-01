import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { D1_MAX_OBJECT_BYTES, D1Storage } from '../../src/worker/adapters/storage/d1';

const bytes = (n: number, fill = 7) => new Uint8Array(n).fill(fill).buffer;

describe('D1 media storage', () => {
  it('stores and returns the exact bytes and type', async () => {
    const s = new D1Storage(env.MEDIA_DB);
    const data = crypto.getRandomValues(new Uint8Array(5000));
    await s.put('shops/a/product/1.webp', data.buffer, 'image/webp');
    const obj = await s.get('shops/a/product/1.webp');
    expect(obj?.contentType).toBe('image/webp');
    expect(obj?.size).toBe(5000);
    expect(new Uint8Array(await new Response(obj?.body).arrayBuffer())).toEqual(data);
  });

  it('counts and deletes only under the given prefix', async () => {
    const s = new D1Storage(env.MEDIA_DB);
    await s.put('shops/p1/logo/a.webp', bytes(100), 'image/webp');
    await s.put('shops/p1/product/b.webp', bytes(250), 'image/webp');
    // Same leading characters, different shop: must not be counted or deleted.
    await s.put('shops/p10/logo/c.webp', bytes(999), 'image/webp');

    expect(await s.usedBytes('shops/p1/')).toBe(350);
    await s.deletePrefix('shops/p1/');
    expect(await s.usedBytes('shops/p1/')).toBe(0);
    expect(await s.get('shops/p10/logo/c.webp')).not.toBeNull();
  });

  it('replaces an object stored under the same key', async () => {
    const s = new D1Storage(env.MEDIA_DB);
    await s.put('k/1', bytes(10, 1), 'image/png');
    await s.put('k/1', bytes(20, 2), 'image/webp');
    expect(await s.usedBytes('k/')).toBe(20);
    expect((await s.get('k/1'))?.contentType).toBe('image/webp');
  });

  it('refuses objects larger than a D1 row can hold', async () => {
    const s = new D1Storage(env.MEDIA_DB);
    await expect(s.put('k/big', bytes(D1_MAX_OBJECT_BYTES + 1), 'image/webp')).rejects.toThrow();
  });
});
