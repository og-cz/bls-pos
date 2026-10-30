import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import type { Storefront } from '../../src/shared/schemas/storefront';
import { addMember, api, createProductAs, signUp } from './helpers';

// A 1×1 PNG.
const png = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  ),
  (ch) => ch.charCodeAt(0),
);

function upload(cookie: string, kind: string, productId?: string) {
  const q = productId ? `?productId=${productId}` : '';
  return api(`/uploads/${kind}${q}`, {
    method: 'POST',
    headers: { 'content-type': 'image/png', cookie },
    body: png,
  }).then((r) => r.json<{ key: string }>());
}

async function setPage(shopId: string, on: boolean, prices = true, stock = false) {
  await env.DB.prepare(
    'UPDATE shops SET storefront_enabled = ?, storefront_show_prices = ?, storefront_show_stock = ?, bio = ? WHERE id = ?',
  )
    .bind(on ? 1 : 0, prices ? 1 : 0, stock ? 1 : 0, 'Parts for every ride', shopId)
    .run();
}

const page = (slug: string) => api(`/public/s/${slug}`);

describe('public shop page', () => {
  it('is off by default, and off looks the same as no shop at all', async () => {
    const owner = await signUp();
    const off = await page(owner.body.shopSlug);
    const none = await page('no-such-shop-here');
    expect(off.status).toBe(404);
    expect(none.status).toBe(404);
    expect(await off.json()).toEqual(await none.json());
  });

  it('shows the shop and its chosen products, never cost, stock counts or staff', async () => {
    const owner = await signUp();
    await addMember(owner, 'staff');
    const shown = await createProductAs(owner.cookie, {
      name: 'Brake Pad',
      priceCents: 65_000,
      costCents: 42_000,
      stock: 7,
    });
    const hidden = await createProductAs(owner.cookie, {
      name: 'Secret Part',
      showOnStorefront: false,
    });
    const gone = await createProductAs(owner.cookie, { name: 'Old Part' });
    await env.DB.prepare('UPDATE products SET archived_at = 1 WHERE id = ?').bind(gone.id).run();
    await setPage(owner.shopId, true);

    const res = await page(owner.body.shopSlug);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=60');
    const text = await res.text();
    const { storefront } = JSON.parse(text) as { storefront: Storefront };
    expect(storefront).toMatchObject({ name: 'Kape ni Juan', bio: 'Parts for every ride' });
    expect(storefront.products).toEqual([
      expect.objectContaining({ id: shown.id, priceCents: 65_000, available: null }),
    ]);
    // No cost, stock count, hidden or archived product, staff username or internal ids.
    expect(text).not.toMatch(/cost|42000|"stock"|Secret Part|Old Part|username|"juan"|shop_?id/i);
    expect(hidden.id).not.toBe(shown.id);
  });

  it('prices and availability follow the shop settings', async () => {
    const owner = await signUp();
    await createProductAs(owner.cookie, { name: 'Out', stock: 0 });
    await createProductAs(owner.cookie, { name: 'In', stock: 3 });
    await setPage(owner.shopId, true, false, true);
    const { storefront } = await (
      await page(owner.body.shopSlug)
    ).json<{ storefront: Storefront }>();
    expect(storefront.products.map((p) => [p.name, p.priceCents, p.available])).toEqual([
      ['In', null, true],
      ['Out', null, false],
    ]);
  });

  it('serves the logo and shown product photos, never avatars or hidden photos', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie, { name: 'Shown' });
    const h = await createProductAs(owner.cookie, { name: 'Hidden', showOnStorefront: false });
    const logo = await upload(owner.cookie, 'logo');
    const avatar = await upload(owner.cookie, 'avatar');
    const photo = await upload(owner.cookie, 'product', p.id);
    const hiddenPhoto = await upload(owner.cookie, 'product', h.id);
    const slug = owner.body.shopSlug;
    const media = (key: string) => api(`/public/s/${slug}/media/${key}`);

    expect((await media(logo.key)).status).toBe(404); // page still off
    await setPage(owner.shopId, true);
    expect((await media(logo.key)).status).toBe(200);
    expect((await media(photo.key)).status).toBe(200);
    expect((await media(avatar.key)).status).toBe(404);
    expect((await media(hiddenPhoto.key)).status).toBe(404);

    // Another shop's open page can't be used to reach this shop's images.
    const other = await signUp();
    await setPage(other.shopId, true);
    expect((await api(`/public/s/${other.body.shopSlug}/media/${logo.key}`)).status).toBe(404);
  });
});
