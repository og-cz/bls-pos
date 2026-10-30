import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { IMPORT_COLUMNS, type ImportColumn } from '../../src/shared/import';
import type { ImportChunkResult } from '../../src/shared/schemas/import';
import {
  addMember,
  createProductAs,
  fillProducts,
  getWithCookie,
  postJson,
  signUp,
} from './helpers';

type Values = Partial<Record<ImportColumn, string>>;

function row(line: number, values: Values) {
  return {
    line,
    values: {
      ...(Object.fromEntries(IMPORT_COLUMNS.map((c) => [c, ''])) as Record<ImportColumn, string>),
      ...values,
    },
  };
}

async function importRows(cookie: string, rows: ReturnType<typeof row>[]) {
  const res = await postJson('/products/import', { rows }, cookie);
  return {
    status: res.status,
    body: await res.json<ImportChunkResult & { error?: { code: string } }>(),
  };
}

async function productBySku(shopId: string, sku: string) {
  return env.DB.prepare('SELECT * FROM products WHERE shop_id = ? AND sku = ?')
    .bind(shopId, sku)
    .first();
}

describe('POST /products/import', () => {
  it('adds new products with categories, in centavos, and logs opening stock', async () => {
    const owner = await signUp();
    const { status, body } = await importRows(owner.cookie, [
      row(2, {
        name: 'Spark plug',
        sku: 'SP-1',
        category: 'Engine',
        price: '120',
        cost: '80',
        stock: '40',
      }),
      row(3, {
        name: 'Brake pad',
        sku: 'BP-1',
        category: 'brakes',
        price: '850.50',
        low_stock_threshold: '3',
      }),
      row(4, { name: 'Labor', price: '300', track_stock: 'no', stock: '9' }),
    ]);
    expect(status).toBe(200);
    expect(body).toEqual({
      created: 3,
      updated: 0,
      skipped: [],
      stockIgnored: 0,
      categoriesCreated: 2,
    });

    expect(await productBySku(owner.shopId, 'SP-1')).toMatchObject({
      price_cents: 12_000,
      cost_cents: 8_000,
      stock: 40,
      low_stock_threshold: 5,
      track_stock: 1,
    });
    expect(await productBySku(owner.shopId, 'BP-1')).toMatchObject({
      price_cents: 85_050,
      stock: 0,
      low_stock_threshold: 3,
    });
    const labor = await env.DB.prepare(
      "SELECT * FROM products WHERE shop_id = ? AND name = 'Labor'",
    )
      .bind(owner.shopId)
      .first();
    expect(labor).toMatchObject({ track_stock: 0, stock: 0 });

    const sp = await productBySku(owner.shopId, 'SP-1');
    const moves = await env.DB.prepare(
      'SELECT delta, reason, user_id FROM stock_movements WHERE product_id = ?',
    )
      .bind(sp?.id)
      .all();
    expect(moves.results).toEqual([{ delta: 40, reason: 'restock', user_id: owner.userId }]);
  });

  it('re-importing the same SKU updates the product instead of duplicating it', async () => {
    const owner = await signUp();
    await importRows(owner.cookie, [
      row(2, {
        name: 'Spark plug',
        sku: 'SP-1',
        price: '120',
        cost: '80',
        stock: '40',
        category: 'Engine',
      }),
    ]);
    const again = await importRows(owner.cookie, [
      row(2, { name: 'Spark plug NGK', sku: 'SP-1', price: '135', stock: '999' }),
    ]);
    expect(again.body).toMatchObject({ created: 0, updated: 1, stockIgnored: 1 });

    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM products WHERE shop_id = ?')
      .bind(owner.shopId)
      .first<{ n: number }>();
    expect(count?.n).toBe(1);
    // New values applied; empty cells keep what was there; stock only changes via Inventory.
    expect(await productBySku(owner.shopId, 'SP-1')).toMatchObject({
      name: 'Spark plug NGK',
      price_cents: 13_500,
      cost_cents: 8_000,
      stock: 40,
    });
    const sp = await productBySku(owner.shopId, 'SP-1');
    expect(sp?.category_id).not.toBeNull();
  });

  it('updates products that were added by hand, by SKU', async () => {
    const owner = await signUp();
    await createProductAs(owner.cookie, { name: 'Chain', sku: 'CH-9', priceCents: 50_000 });
    const { body } = await importRows(owner.cookie, [
      row(2, { name: 'Chain 428', sku: 'CH-9', price: '520' }),
    ]);
    expect(body).toMatchObject({ created: 0, updated: 1 });
  });

  it('reuses categories by name, ignoring case', async () => {
    const owner = await signUp();
    await postJson('/categories', { name: 'Engine' }, owner.cookie);
    const { body } = await importRows(owner.cookie, [
      row(2, { name: 'A', price: '1', category: 'ENGINE' }),
      row(3, { name: 'B', price: '1', category: 'engine' }),
    ]);
    expect(body.categoriesCreated).toBe(0);
    const cats = await env.DB.prepare('SELECT COUNT(*) AS n FROM categories WHERE shop_id = ?')
      .bind(owner.shopId)
      .first<{ n: number }>();
    expect(cats?.n).toBe(1);
  });

  it('skips bad rows with the reason, and saves the good ones', async () => {
    const owner = await signUp();
    const { body } = await importRows(owner.cookie, [
      row(2, { name: 'Good', sku: 'G-1', price: '10' }),
      row(3, { name: 'No price', sku: 'N-1' }),
      row(4, { name: 'Twin', sku: 'G-1', price: '10' }),
    ]);
    expect(body.created).toBe(1);
    expect(body.skipped).toEqual([
      { line: 3, message: 'price is missing' },
      { line: 4, message: 'SKU is also on row 2' },
    ]);
  });

  it("never touches another shop's product with the same SKU", async () => {
    const a = await signUp();
    const b = await signUp();
    await createProductAs(b.cookie, { name: 'B part', sku: 'X-1', priceCents: 777 });
    const { body } = await importRows(a.cookie, [
      row(2, { name: 'A part', sku: 'X-1', price: '1' }),
    ]);
    expect(body).toMatchObject({ created: 1, updated: 0 });
    expect(await productBySku(b.shopId, 'X-1')).toMatchObject({ name: 'B part', price_cents: 777 });
  });

  it('refuses a chunk that would go over the product limit, writing nothing', async () => {
    const owner = await signUp();
    await fillProducts(owner.shopId, 4_999);
    const { status, body } = await importRows(owner.cookie, [
      row(2, { name: 'One', price: '1' }),
      row(3, { name: 'Two', price: '1' }),
    ]);
    expect(status).toBe(409);
    expect(body.error?.code).toBe('PRODUCT_LIMIT_REACHED');
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM products WHERE shop_id = ?')
      .bind(owner.shopId)
      .first<{ n: number }>();
    expect(count?.n).toBe(4_999);
  });

  it('takes at most 250 rows per request, and only from admins', async () => {
    const owner = await signUp();
    const tooMany = Array.from({ length: 251 }, (_, i) =>
      row(i + 2, { name: `P${i}`, price: '1' }),
    );
    expect((await importRows(owner.cookie, tooMany)).status).toBe(400);
    const staff = await addMember(owner, 'staff');
    expect((await importRows(staff.cookie, [row(2, { name: 'A', price: '1' })])).status).toBe(403);
  });

  it('records one activity entry per chunk', async () => {
    const owner = await signUp();
    await importRows(owner.cookie, [row(2, { name: 'A', price: '1' })]);
    const audit = await (
      await getWithCookie('/audit', owner.cookie)
    ).json<{
      entries: { action: string; details: Record<string, unknown> }[];
    }>();
    expect(audit.entries[0]).toMatchObject({
      action: 'product.import',
      details: { created: 1, updated: 0 },
    });
  });

  it('imports 5,000 products in 250-row chunks, then re-imports them as updates', async () => {
    const owner = await signUp();
    const all = Array.from({ length: 5_000 }, (_, i) =>
      row(i + 2, {
        name: `Part ${i}`,
        sku: `P-${String(i).padStart(5, '0')}`,
        category: `Cat ${i % 20}`,
        price: `${100 + (i % 50)}.50`,
        stock: String(i % 30),
      }),
    );
    let created = 0;
    for (let i = 0; i < all.length; i += 250) {
      const { status, body } = await importRows(owner.cookie, all.slice(i, i + 250));
      expect(status).toBe(200);
      created += body.created;
    }
    expect(created).toBe(5_000);

    const second = await importRows(owner.cookie, all.slice(0, 250));
    expect(second.body).toMatchObject({ created: 0, updated: 250 });
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM products WHERE shop_id = ?')
      .bind(owner.shopId)
      .first<{ n: number }>();
    expect(count?.n).toBe(5_000);
  }, 120_000);
});
