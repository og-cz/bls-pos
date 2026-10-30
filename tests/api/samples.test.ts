import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { SAMPLE_PRODUCTS } from '../../src/shared/samples';
import type { ProductDto } from '../../src/shared/schemas/products';
import { addMember, api, getWithCookie, postJson, signUp } from './helpers';

const products = async (cookie: string) =>
  (await (await getWithCookie('/products?limit=100', cookie)).json<{ products: ProductDto[] }>())
    .products;

describe('sample products', () => {
  it('adds the samples for the kind of shop, with categories and opening stock, once', async () => {
    const owner = await signUp({ businessType: 'cafe' });
    const res = await postJson('/shop/samples', {}, owner.cookie);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ added: SAMPLE_PRODUCTS.cafe.length });

    const list = await products(owner.cookie);
    expect(list.map((p) => p.name).sort()).toEqual(SAMPLE_PRODUCTS.cafe.map((p) => p.name).sort());
    expect(list.find((p) => p.name === 'Ensaymada')).toMatchObject({ stock: 12, trackStock: true });
    expect(list.find((p) => p.name === 'Iced Latte')).toMatchObject({ trackStock: false });
    const cats = await env.DB.prepare('SELECT name FROM categories WHERE shop_id = ? ORDER BY name')
      .bind(owner.shopId)
      .all<{ name: string }>();
    expect(cats.results.map((c) => c.name)).toEqual(['Coffee', 'Drinks', 'Pastries']);

    expect((await postJson('/shop/samples', {}, owner.cookie)).status).toBe(409);
  });

  it('removing deletes unsold samples and archives sold ones, keeping their sales', async () => {
    const owner = await signUp({ businessType: 'retail' });
    await postJson('/shop/samples', {}, owner.cookie);
    const oil = (await products(owner.cookie)).find((p) => p.name === 'Engine Oil 1L');
    const sale = await postJson(
      '/sales',
      {
        idempotencyKey: crypto.randomUUID().replace(/-/g, ''),
        paymentMethod: 'cash',
        items: [{ productId: oil?.id, quantity: 1 }],
      },
      owner.cookie,
    );
    expect(sale.status).toBe(201);

    const del = await api('/shop/samples', { method: 'DELETE', headers: { cookie: owner.cookie } });
    expect(await del.json()).toEqual({ removed: SAMPLE_PRODUCTS.retail.length });
    expect(await products(owner.cookie)).toEqual([]);

    const rows = await env.DB.prepare(
      'SELECT name, sku, archived_at FROM products WHERE shop_id = ?',
    )
      .bind(owner.shopId)
      .all<{ name: string; sku: string | null; archived_at: number | null }>();
    expect(rows.results).toEqual([
      { name: 'Engine Oil 1L', sku: null, archived_at: expect.any(Number) as number },
    ]);
    // Samples can be added again afterwards.
    expect((await postJson('/shop/samples', {}, owner.cookie)).status).toBe(201);
  });

  it('staff cannot add or remove samples; real products are never touched', async () => {
    const owner = await signUp();
    const staff = await addMember(owner, 'staff');
    await postJson(
      '/products',
      { name: 'My Real Item', priceCents: 100, sku: 'REAL-1' },
      owner.cookie,
    );
    expect((await postJson('/shop/samples', {}, staff.cookie)).status).toBe(403);
    const del = await api('/shop/samples', { method: 'DELETE', headers: { cookie: staff.cookie } });
    expect(del.status).toBe(403);
    await api('/shop/samples', { method: 'DELETE', headers: { cookie: owner.cookie } });
    expect((await products(owner.cookie)).map((p) => p.name)).toEqual(['My Real Item']);
  });
});
