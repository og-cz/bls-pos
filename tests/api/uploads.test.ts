import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import type { StorageAdapter } from '../../src/worker/adapters/types';
import { getDb } from '../../src/worker/db/client';
import { uploadImage } from '../../src/worker/services/uploads';
import { addMember, api, createProductAs, signUp } from './helpers';

// Tiny but genuine file headers; the server only looks at the first bytes.
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
]);
const SVG = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
);
const HTML = new TextEncoder().encode('<!doctype html><script>alert(1)</script>');

function upload(path: string, body: Uint8Array, type: string, cookie: string) {
  return api(`/uploads/${path}`, {
    method: 'POST',
    headers: { 'content-type': type, cookie },
    body,
  });
}

type Uploaded = { key: string; url: string };

describe('POST /uploads/:kind', () => {
  it('stores a product photo under a generated key and links it to the product', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie);
    const res = await upload(`product?productId=${p.id}`, PNG, 'image/png', owner.cookie);
    expect(res.status).toBe(201);
    const { key, url } = await res.json<Uploaded>();
    expect(key).toMatch(new RegExp(`^shops/${owner.shopId}/product/[0-9a-f-]{36}\\.png$`));
    expect(url).toBe(`/api/v1/media/${key}`);

    const row = await env.DB.prepare('SELECT image_key FROM products WHERE id = ?')
      .bind(p.id)
      .first<{ image_key: string }>();
    expect(row?.image_key).toBe(key);
  });

  it('accepts JPEG and WebP for the logo and cover', async () => {
    const owner = await signUp();
    expect((await upload('logo', JPEG, 'image/jpeg', owner.cookie)).status).toBe(201);
    expect((await upload('cover', WEBP, 'image/webp', owner.cookie)).status).toBe(201);
    const shop = await env.DB.prepare('SELECT logo_key, cover_key FROM shops WHERE id = ?')
      .bind(owner.shopId)
      .first<{ logo_key: string; cover_key: string }>();
    expect(shop?.logo_key).toMatch(/\/logo\/.+\.jpg$/);
    expect(shop?.cover_key).toMatch(/\/cover\/.+\.webp$/);
  });

  it('refuses SVG, HTML and files whose bytes do not match their declared type', async () => {
    const owner = await signUp();
    for (const [body, type] of [
      [SVG, 'image/svg+xml'],
      [SVG, 'image/png'],
      [HTML, 'image/jpeg'],
      [JPEG, 'image/png'],
      [PNG, 'application/octet-stream'],
    ] as const) {
      const res = await upload('logo', body, type, owner.cookie);
      expect(res.status, type).toBe(415);
      expect(await res.json()).toMatchObject({ error: { code: 'UNSUPPORTED_IMAGE' } });
    }
  });

  it('refuses images over 2 MB and empty files', async () => {
    const owner = await signUp();
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    big.set(PNG);
    expect((await upload('logo', big, 'image/png', owner.cookie)).status).toBe(413);
    expect((await upload('logo', new Uint8Array(), 'image/png', owner.cookie)).status).toBe(400);
  });

  it('replaces the old image instead of keeping both', async () => {
    const owner = await signUp();
    const first = await (await upload('logo', PNG, 'image/png', owner.cookie)).json<Uploaded>();
    await upload('logo', JPEG, 'image/jpeg', owner.cookie);
    expect(await env.MEDIA.get(first.key)).toBeNull();
  });

  it("enforces the plan's image space", async () => {
    const owner = await signUp();
    // A storage adapter reporting the shop's 200 MB as fully used.
    let stored = 0;
    const full: StorageAdapter = {
      put: () => {
        stored += 1;
        return Promise.resolve();
      },
      get: () => Promise.resolve(null),
      delete: () => Promise.resolve(),
      usedBytes: () => Promise.resolve(200 * 1024 * 1024),
    };
    const attempt = uploadImage(
      getDb(env.DB),
      owner.shopId,
      full,
      { userId: owner.userId, role: 'owner', ipHash: null },
      { kind: 'logo', data: PNG.slice().buffer, declaredType: 'image/png' },
    );
    await expect(attempt).rejects.toMatchObject({ code: 'STORAGE_LIMIT_REACHED', status: 409 });
    expect(stored).toBe(0);
  });

  it('lets staff set their own avatar but not shop images or product photos', async () => {
    const owner = await signUp();
    const staff = await addMember(owner, 'staff');
    const p = await createProductAs(owner.cookie);
    expect((await upload('avatar', PNG, 'image/png', staff.cookie)).status).toBe(201);
    expect((await upload('logo', PNG, 'image/png', staff.cookie)).status).toBe(403);
    expect((await upload(`product?productId=${p.id}`, PNG, 'image/png', staff.cookie)).status).toBe(
      403,
    );

    const row = await env.DB.prepare('SELECT avatar_key FROM users WHERE id = ?')
      .bind(staff.id)
      .first<{ avatar_key: string | null }>();
    expect(row?.avatar_key).toMatch(/\/avatar\//);
  });

  it("can't attach a photo to another shop's product", async () => {
    const a = await signUp();
    const b = await signUp();
    const bp = await createProductAs(b.cookie);
    expect((await upload(`product?productId=${bp.id}`, PNG, 'image/png', a.cookie)).status).toBe(
      404,
    );
  });

  it('rejects unknown upload kinds', async () => {
    const owner = await signUp();
    expect((await upload('anything', PNG, 'image/png', owner.cookie)).status).toBe(404);
  });
});

describe('GET /media/*', () => {
  it('serves the image with safe headers to the same shop', async () => {
    const owner = await signUp();
    const { url } = await (await upload('logo', PNG, 'image/png', owner.cookie)).json<Uploaded>();
    const res = await api(url.replace('/api/v1', ''), { headers: { cookie: owner.cookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-disposition')).toBe('inline');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
  });

  it("hides another shop's images and needs a session", async () => {
    const a = await signUp();
    const b = await signUp();
    const { url } = await (await upload('logo', PNG, 'image/png', b.cookie)).json<Uploaded>();
    const path = url.replace('/api/v1', '');
    expect((await api(path, { headers: { cookie: a.cookie } })).status).toBe(404);
    expect((await api(path)).status).toBe(401);
    expect(
      (
        await api(`/media/shops/${a.shopId}/../${b.shopId}/logo/x.png`, {
          headers: { cookie: a.cookie },
        })
      ).status,
    ).toBe(404);
  });
});
