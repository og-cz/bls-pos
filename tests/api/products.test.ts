import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { addMember, api, createProductAs, getWithCookie, postJson, signUp } from './helpers';

type Product = {
  id: string;
  name: string;
  sku: string | null;
  priceCents: number;
  costCents?: number | null;
  stock: number;
  trackStock: boolean;
  archived: boolean;
};
type List = { products: Product[]; nextCursor: string | null };

function patch(path: string, body: unknown, cookie: string) {
  return api(path, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

describe('POST /products', () => {
  it('creates a product with defaults, in centavos', async () => {
    const owner = await signUp();
    const res = await postJson(
      '/products',
      { name: 'Iced Latte', priceCents: 12_000, costCents: 4_500, sku: 'LAT-12', stock: 20 },
      owner.cookie,
    );
    expect(res.status).toBe(201);
    const { product } = await res.json<{ product: Product }>();
    expect(product).toMatchObject({
      name: 'Iced Latte',
      sku: 'LAT-12',
      priceCents: 12_000,
      costCents: 4_500,
      trackStock: true,
      stock: 20,
      archived: false,
    });

    const row = await env.DB.prepare('SELECT shop_id FROM products WHERE id = ?')
      .bind(product.id)
      .first<{ shop_id: string }>();
    expect(row?.shop_id).toBe(owner.shopId);
  });

  it('logs opening stock as a stock movement', async () => {
    const owner = await signUp();
    const product = await createProductAs(owner.cookie, { stock: 7 });
    const moves = await env.DB.prepare(
      'SELECT delta, reason, note, user_id FROM stock_movements WHERE product_id = ?',
    )
      .bind(product.id)
      .all();
    expect(moves.results).toEqual([
      { delta: 7, reason: 'restock', note: 'Opening stock', user_id: owner.userId },
    ]);
  });

  it('treats an empty SKU as none, so many products can have no SKU', async () => {
    const owner = await signUp();
    const a = await createProductAs(owner.cookie, { sku: '' });
    await createProductAs(owner.cookie, { sku: '' });
    expect(a.sku).toBeNull();
  });

  it('rejects a SKU already used in the shop, but not in another shop', async () => {
    const a = await signUp();
    const b = await signUp();
    await createProductAs(a.cookie, { sku: 'X1' });
    const dup = await postJson('/products', { name: 'Dup', priceCents: 1, sku: 'X1' }, a.cookie);
    expect(dup.status).toBe(409);
    expect(await dup.json()).toMatchObject({
      error: { code: 'SKU_TAKEN', fields: { sku: 'Already used by another product.' } },
    });
    await createProductAs(b.cookie, { sku: 'X1' });
  });

  it('validates prices, names and stock', async () => {
    const owner = await signUp();
    for (const body of [
      { name: 'A', priceCents: 12.5 },
      { name: 'A', priceCents: -1 },
      { name: 'A', priceCents: '100' },
      { name: '', priceCents: 1 },
      { name: 'A', priceCents: 1, stock: -3 },
      { name: 'A', priceCents: 1, sku: 'has space' },
      { name: 'A', priceCents: 1, shopId: 'other' },
      { name: 'A', priceCents: 1, archivedAt: 1 },
    ]) {
      const res = await postJson('/products', body, owner.cookie);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("refuses another shop's category", async () => {
    const a = await signUp();
    const b = await signUp();
    const bCat = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO categories (id, shop_id, name) VALUES (?, ?, 'Drinks')")
      .bind(bCat, b.shopId)
      .run();
    const res = await postJson(
      '/products',
      { name: 'A', priceCents: 1, categoryId: bCat },
      a.cookie,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: { fields: { categoryId: 'Unknown category.' } },
    });
  });

  it('enforces the Free limit of 500 active products', async () => {
    const owner = await signUp();
    const stmt = env.DB.prepare(
      `INSERT INTO products (id, shop_id, name, price_cents, created_at, updated_at)
       VALUES (?, ?, 'Bulk', 100, 0, 0)`,
    );
    await env.DB.batch(
      Array.from({ length: 500 }, () => stmt.bind(crypto.randomUUID(), owner.shopId)),
    );
    const res = await postJson('/products', { name: 'One more', priceCents: 1 }, owner.cookie);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'PRODUCT_LIMIT_REACHED' } });

    await env.DB.prepare(
      'UPDATE products SET archived_at = 1 WHERE id = (SELECT id FROM products WHERE shop_id = ? LIMIT 1)',
    )
      .bind(owner.shopId)
      .run();
    expect(
      (await postJson('/products', { name: 'Fits now', priceCents: 1 }, owner.cookie)).status,
    ).toBe(201);
  });

  it('is for admins and the owner only', async () => {
    const owner = await signUp();
    const staff = await addMember(owner, 'staff');
    const admin = await addMember(owner, 'admin');
    expect((await postJson('/products', { name: 'A', priceCents: 1 }, staff.cookie)).status).toBe(
      403,
    );
    expect((await postJson('/products', { name: 'A', priceCents: 1 }, admin.cookie)).status).toBe(
      201,
    );
  });
});

describe('GET /products', () => {
  it('never sends cost to staff', async () => {
    const owner = await signUp();
    const staff = await addMember(owner, 'staff');
    const p = await createProductAs(owner.cookie, { costCents: 4_000 });

    const asStaff = await (await getWithCookie('/products', staff.cookie)).text();
    expect(asStaff).not.toContain('costCents');
    const parsed = JSON.parse(asStaff) as List;
    expect(parsed.products.every((p) => !('costCents' in p))).toBe(true);
    const one = await (await getWithCookie(`/products/${p.id}`, staff.cookie)).text();
    expect(one).not.toContain('costCents');

    const asOwner = await (await getWithCookie('/products', owner.cookie)).json<List>();
    expect(asOwner.products[0]?.costCents).toBe(4_000);
  });

  it('sorts A–Z, searches by name or SKU, and pages with a cursor', async () => {
    const owner = await signUp();
    for (const [name, sku] of [
      ['banana bread', null],
      ['Americano', 'AM-1'],
      ['Café Latte', null],
      ['100% Juice', null],
      ['Donut', 'DN-9'],
    ] as const) {
      await createProductAs(owner.cookie, { name, sku });
    }

    const all = await (await getWithCookie('/products', owner.cookie)).json<List>();
    expect(all.products.map((p) => p.name)).toEqual([
      '100% Juice',
      'Americano',
      'banana bread',
      'Café Latte',
      'Donut',
    ]);

    const search = async (q: string) =>
      (
        await (
          await getWithCookie(`/products?q=${encodeURIComponent(q)}`, owner.cookie)
        ).json<List>()
      ).products.map((p) => p.name);
    expect(await search('LAT')).toEqual(['Café Latte']);
    expect(await search('dn-9')).toEqual(['Donut']);
    expect(await search('%')).toEqual(['100% Juice']); // % is a plain character

    const first = await (await getWithCookie('/products?limit=2', owner.cookie)).json<List>();
    expect(first.products.map((p) => p.name)).toEqual(['100% Juice', 'Americano']);
    const second = await (
      await getWithCookie(`/products?limit=2&cursor=${first.nextCursor ?? ''}`, owner.cookie)
    ).json<List>();
    expect(second.products.map((p) => p.name)).toEqual(['banana bread', 'Café Latte']);
    const third = await (
      await getWithCookie(`/products?limit=2&cursor=${second.nextCursor ?? ''}`, owner.cookie)
    ).json<List>();
    expect(third.products.map((p) => p.name)).toEqual(['Donut']);
    expect(third.nextCursor).toBeNull();
  });

  it('rejects bad paging values and unknown query fields', async () => {
    const { cookie } = await signUp();
    for (const q of ['?limit=0', '?limit=101', '?cursor=not-a-cursor', '?shopId=x']) {
      expect((await getWithCookie(`/products${q}`, cookie)).status, q).toBe(400);
    }
  });

  it("never shows or opens another shop's products", async () => {
    const a = await signUp();
    const b = await signUp();
    const bProduct = await createProductAs(b.cookie, { name: 'Secret B item' });
    const list = await (await getWithCookie('/products', a.cookie)).text();
    expect(list).not.toContain('Secret B item');
    expect((await getWithCookie(`/products/${bProduct.id}`, a.cookie)).status).toBe(404);
  });
});

describe('PATCH /products/:id', () => {
  it('updates fields and logs price changes with old and new price', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie, { priceCents: 10_000 });
    const res = await patch(
      `/products/${p.id}`,
      { priceCents: 11_000, name: 'Big Latte' },
      owner.cookie,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ product: { priceCents: 11_000, name: 'Big Latte' } });

    const entry = await env.DB.prepare(
      "SELECT details_json FROM audit_log WHERE shop_id = ? AND action = 'product.update'",
    )
      .bind(owner.shopId)
      .first<{ details_json: string }>();
    expect(JSON.parse(entry?.details_json ?? '{}')).toMatchObject({
      name: 'Big Latte',
      priceFrom: 10_000,
      priceTo: 11_000,
    });
  });

  it('cannot change stock directly; stock only moves through logged movements', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie, { stock: 3 });
    const res = await patch(`/products/${p.id}`, { stock: 999 }, owner.cookie);
    expect(res.status).toBe(400);
  });

  it("can't touch another shop's product, and staff can't edit", async () => {
    const a = await signUp();
    const b = await signUp();
    const bProduct = await createProductAs(b.cookie, { priceCents: 500 });
    expect((await patch(`/products/${bProduct.id}`, { priceCents: 1 }, a.cookie)).status).toBe(404);

    const staff = await addMember(b, 'staff');
    expect((await patch(`/products/${bProduct.id}`, { priceCents: 1 }, staff.cookie)).status).toBe(
      403,
    );
    const row = await env.DB.prepare('SELECT price_cents FROM products WHERE id = ?')
      .bind(bProduct.id)
      .first<{ price_cents: number }>();
    expect(row?.price_cents).toBe(500);
  });

  it('rejects an empty change', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie);
    expect((await patch(`/products/${p.id}`, {}, owner.cookie)).status).toBe(400);
  });
});
