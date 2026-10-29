import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

const now = Date.now();
let n = 0;

async function shop() {
  n += 1;
  const id = `shop-p-${n}-${crypto.randomUUID()}`;
  await env.DB.prepare(
    `INSERT INTO shops (id, slug, name, business_type, theme_json, created_at)
     VALUES (?, ?, 'Test', 'retail', '{}', ?)`,
  )
    .bind(id, `p-${n}-${crypto.randomUUID().slice(0, 8)}`, now)
    .run();
  return id;
}

function product(
  shopId: string,
  fields: {
    sku?: string | null;
    stock?: number;
    track?: 0 | 1;
    price?: number;
    cost?: number | null;
  } = {},
) {
  const id = crypto.randomUUID();
  return {
    id,
    run: () =>
      env.DB.prepare(
        `INSERT INTO products (id, shop_id, name, sku, price_cents, cost_cents, track_stock, stock, created_at, updated_at)
         VALUES (?, ?, 'Item', ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          id,
          shopId,
          fields.sku ?? null,
          fields.price ?? 100,
          fields.cost ?? null,
          fields.track ?? 1,
          fields.stock ?? 0,
          now,
          now,
        )
        .run(),
  };
}

describe('products schema', () => {
  it('applies the defaults from the data model', async () => {
    const s = await shop();
    const p = product(s);
    await p.run();
    const row = await env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(p.id).first();
    expect(row).toMatchObject({
      track_stock: 1,
      stock: 0,
      low_stock_threshold: 5,
      show_on_storefront: 1,
      archived_at: null,
    });
  });

  it('refuses negative stock for tracked items, so overselling is impossible', async () => {
    const s = await shop();
    const p = product(s, { stock: 2 });
    await p.run();
    await expect(
      env.DB.prepare('UPDATE products SET stock = stock - 3 WHERE id = ?').bind(p.id).run(),
    ).rejects.toThrow(/CHECK constraint failed/);
    await env.DB.prepare('UPDATE products SET stock = stock - 2 WHERE id = ?').bind(p.id).run();
  });

  it('allows any stock number for untracked items (e.g. made-to-order drinks)', async () => {
    const s = await shop();
    await product(s, { track: 0, stock: -5 }).run();
  });

  it('refuses negative prices and costs', async () => {
    const s = await shop();
    await expect(product(s, { price: -1 }).run()).rejects.toThrow(/CHECK/);
    await expect(product(s, { cost: -1 }).run()).rejects.toThrow(/CHECK/);
  });

  it('keeps SKUs unique per shop, but allows many products without one', async () => {
    const a = await shop();
    const b = await shop();
    await product(a, { sku: 'LATTE-12' }).run();
    await expect(product(a, { sku: 'LATTE-12' }).run()).rejects.toThrow(/UNIQUE/);
    await product(b, { sku: 'LATTE-12' }).run();
    await product(a).run();
    await product(a).run();
  });

  it('keeps category names unique per shop', async () => {
    const a = await shop();
    const b = await shop();
    const add = (shopId: string) =>
      env.DB.prepare("INSERT INTO categories (id, shop_id, name) VALUES (?, ?, 'Drinks')")
        .bind(crypto.randomUUID(), shopId)
        .run();
    await add(a);
    await add(b);
    await expect(add(a)).rejects.toThrow(/UNIQUE/);
  });

  it('only accepts the listed stock movement reasons', async () => {
    const s = await shop();
    const p = product(s, { stock: 1 });
    await p.run();
    const userId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO users (id, shop_id, username, display_name, role, password_hash, created_at)
       VALUES (?, ?, 'u', 'U', 'staff', 'x', ?)`,
    )
      .bind(userId, s, now)
      .run();
    const move = (reason: string) =>
      env.DB.prepare(
        `INSERT INTO stock_movements (id, shop_id, product_id, user_id, delta, reason, created_at)
         VALUES (?, ?, ?, ?, -1, ?, ?)`,
      )
        .bind(crypto.randomUUID(), s, p.id, userId, reason, now)
        .run();
    for (const reason of ['damaged', 'expired', 'used', 'lost', 'restock', 'correction']) {
      await move(reason);
    }
    await expect(move('stolen-by-boss')).rejects.toThrow(/CHECK/);
  });
});
