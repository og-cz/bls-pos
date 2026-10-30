import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { addMember, api, createProductAs, signUp } from './helpers';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46]);

function upload(path: string, body: Uint8Array, type: string, cookie: string) {
  return api(`/uploads/${path}`, {
    method: 'POST',
    headers: { 'content-type': type, cookie },
    body,
  });
}

type Product = { imageUrl: string | null; thumbUrl: string | null };

async function getProduct(id: string, cookie: string) {
  return (
    await (await api(`/products/${id}`, { headers: { cookie } })).json<{ product: Product }>()
  ).product;
}

describe('product photo thumbnails', () => {
  it('stores the thumbnail next to the photo and returns both URLs', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie);
    const main = await upload(`product?productId=${p.id}`, PNG, 'image/png', owner.cookie);
    const { key } = await main.json<{ key: string }>();

    const res = await upload(`product-thumb?productId=${p.id}`, PNG, 'image/png', owner.cookie);
    expect(res.status).toBe(201);
    const thumb = await res.json<{ key: string }>();
    expect(thumb.key).toBe(key.replace(/\.png$/, '.thumb.png'));
    expect(await env.MEDIA.head(thumb.key)).not.toBeNull();

    const product = await getProduct(p.id, owner.cookie);
    expect(product.imageUrl).toBe(`/api/v1/media/${key}`);
    expect(product.thumbUrl).toBe(`/api/v1/media/${thumb.key}`);
  });

  it('needs the photo first, in the same format', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie);
    const early = await upload(`product-thumb?productId=${p.id}`, PNG, 'image/png', owner.cookie);
    expect(early.status).toBe(409);
    expect(await early.json()).toMatchObject({ error: { code: 'NO_PHOTO' } });

    await upload(`product?productId=${p.id}`, PNG, 'image/png', owner.cookie);
    const mismatch = await upload(
      `product-thumb?productId=${p.id}`,
      JPEG,
      'image/jpeg',
      owner.cookie,
    );
    expect(mismatch.status).toBe(415);
  });

  it('refuses big thumbnails', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie);
    await upload(`product?productId=${p.id}`, PNG, 'image/png', owner.cookie);
    const big = new Uint8Array(200 * 1024 + 1);
    big.set(PNG);
    expect(
      (await upload(`product-thumb?productId=${p.id}`, big, 'image/png', owner.cookie)).status,
    ).toBe(413);
  });

  it('a new photo removes the old photo and its thumbnail', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie);
    const first = await (
      await upload(`product?productId=${p.id}`, PNG, 'image/png', owner.cookie)
    ).json<{ key: string }>();
    const firstThumb = await (
      await upload(`product-thumb?productId=${p.id}`, PNG, 'image/png', owner.cookie)
    ).json<{ key: string }>();

    await upload(`product?productId=${p.id}`, PNG, 'image/png', owner.cookie);
    expect(await env.MEDIA.head(first.key)).toBeNull();
    expect(await env.MEDIA.head(firstThumb.key)).toBeNull();
  });

  it("is for admins only, and never for another shop's product", async () => {
    const a = await signUp();
    const b = await signUp();
    const bp = await createProductAs(b.cookie);
    await upload(`product?productId=${bp.id}`, PNG, 'image/png', b.cookie);
    const staff = await addMember(b, 'staff');
    expect(
      (await upload(`product-thumb?productId=${bp.id}`, PNG, 'image/png', staff.cookie)).status,
    ).toBe(403);
    expect(
      (await upload(`product-thumb?productId=${bp.id}`, PNG, 'image/png', a.cookie)).status,
    ).toBe(404);
  });
});
