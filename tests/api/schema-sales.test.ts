import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { signUp } from './helpers';

function insertSale(
  shopId: string,
  userId: string,
  fields: Partial<{
    number: number;
    key: string;
    subtotal: number;
    discount: number;
    total: number;
    status: string;
  }> = {},
) {
  const id = crypto.randomUUID();
  return {
    id,
    run: () =>
      env.DB.prepare(
        `INSERT INTO sales (id, shop_id, number, user_id, subtotal_cents, discount_cents, total_cents,
           payment_method, idempotency_key, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'cash', ?, ?, ?)`,
      )
        .bind(
          id,
          shopId,
          fields.number ?? 1,
          userId,
          fields.subtotal ?? 100,
          fields.discount ?? 0,
          fields.total ?? 100,
          fields.key ?? crypto.randomUUID(),
          fields.status ?? 'completed',
          Date.now(),
        )
        .run(),
  };
}

describe('sales schema', () => {
  it('keeps sale numbers unique per shop, but each shop starts at 1', async () => {
    const a = await signUp();
    const b = await signUp();
    await insertSale(a.shopId, a.userId, { number: 1 }).run();
    await insertSale(b.shopId, b.userId, { number: 1 }).run();
    await expect(insertSale(a.shopId, a.userId, { number: 1 }).run()).rejects.toThrow(/UNIQUE/);
  });

  it('refuses a second sale with the same idempotency key in a shop', async () => {
    const a = await signUp();
    await insertSale(a.shopId, a.userId, { number: 1, key: 'k-1' }).run();
    await expect(insertSale(a.shopId, a.userId, { number: 2, key: 'k-1' }).run()).rejects.toThrow(
      /UNIQUE/,
    );
  });

  it('refuses negative amounts, a discount above the subtotal and unknown statuses', async () => {
    const a = await signUp();
    for (const bad of [
      { total: -1 },
      { discount: -5 },
      { subtotal: 100, discount: 150, total: 0 },
      { status: 'deleted' },
    ]) {
      await expect(
        insertSale(a.shopId, a.userId, { number: Math.random() * 1e9, ...bad }).run(),
        JSON.stringify(bad),
      ).rejects.toThrow(/CHECK/);
    }
  });

  it('sale lines must have a positive quantity', async () => {
    const a = await signUp();
    const sale = insertSale(a.shopId, a.userId);
    await sale.run();
    const line = (qty: number) =>
      env.DB.prepare(
        `INSERT INTO sale_items (id, sale_id, shop_id, product_id, name_snapshot, unit_price_cents, quantity, line_total_cents)
         VALUES (?, ?, ?, 'p', 'Item', 100, ?, 100)`,
      )
        .bind(crypto.randomUUID(), sale.id, a.shopId, qty)
        .run();
    await line(1);
    await expect(line(0)).rejects.toThrow(/CHECK/);
  });
});
