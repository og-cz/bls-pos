import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import type { Receipt } from '../../src/shared/schemas/sales';
import { addMember, api, createProductAs, getWithCookie, postJson, signUp } from './helpers';

const key = () => crypto.randomUUID().replace(/-/g, '');

function sell(cookie: string, items: { productId: string; quantity: number }[], extra = {}) {
  return postJson(
    '/sales',
    { idempotencyKey: key(), paymentMethod: 'cash', items, ...extra },
    cookie,
  );
}

async function stockOf(id: string) {
  return (
    await env.DB.prepare('SELECT stock FROM products WHERE id = ?')
      .bind(id)
      .first<{ stock: number }>()
  )?.stock;
}

describe('sales under pressure', () => {
  it('five tills at once get five different numbers, 1 to 5, with no gaps', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie, { priceCents: 100, stock: 100 });
    const results = await Promise.all(
      Array.from({ length: 5 }, () => sell(owner.cookie, [{ productId: p.id, quantity: 1 }])),
    );
    const numbers = await Promise.all(
      results.map(async (r) => (await r.json<{ receipt: Receipt }>()).receipt.number),
    );
    expect(numbers.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    expect(await stockOf(p.id)).toBe(95);
  });

  it('two carts racing for shared stock: never negative, the loser changes nothing', async () => {
    const owner = await signUp();
    const x = await createProductAs(owner.cookie, { priceCents: 100, stock: 5 });
    const y = await createProductAs(owner.cookie, { priceCents: 100, stock: 1 });
    const [a, b] = await Promise.all([
      sell(owner.cookie, [
        { productId: x.id, quantity: 2 },
        { productId: y.id, quantity: 1 },
      ]),
      sell(owner.cookie, [
        { productId: x.id, quantity: 1 },
        { productId: y.id, quantity: 1 },
      ]),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await stockOf(y.id)).toBe(0);
    // x lost only what the winning cart took (2 or 1), never both.
    expect([3, 4]).toContain(await stockOf(x.id));
  });

  it('a receipt keeps the price paid even after the product price changes', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie, { name: 'Oil', priceCents: 30_000, stock: 5 });
    const { receipt } = await (
      await sell(owner.cookie, [{ productId: p.id, quantity: 1 }])
    ).json<{ receipt: Receipt }>();
    await api(`/products/${p.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: owner.cookie },
      body: JSON.stringify({ priceCents: 45_000, name: 'Oil 1L' }),
    });
    const again = await (
      await getWithCookie(`/sales/${receipt.id}`, owner.cookie)
    ).json<{ receipt: Receipt }>();
    expect(again.receipt.lines[0]).toMatchObject({ name: 'Oil', unitPriceCents: 30_000 });
    expect(again.receipt.totalCents).toBe(30_000);
  });

  it('a voided sale puts stock back so it can be sold again', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie, { priceCents: 100, stock: 1 });
    const { receipt } = await (
      await sell(owner.cookie, [{ productId: p.id, quantity: 1 }])
    ).json<{
      receipt: Receipt;
    }>();
    expect((await sell(owner.cookie, [{ productId: p.id, quantity: 1 }])).status).toBe(409);
    await postJson(`/sales/${receipt.id}/void`, { reason: 'Wrong item' }, owner.cookie);
    expect((await sell(owner.cookie, [{ productId: p.id, quantity: 1 }])).status).toBe(201);
    expect(await stockOf(p.id)).toBe(0);
  });

  it('receipts never carry cost, for staff or admins', async () => {
    const owner = await signUp();
    const staff = await addMember(owner, 'staff');
    const p = await createProductAs(owner.cookie, { priceCents: 1_000, costCents: 600, stock: 5 });
    const res = await sell(staff.cookie, [{ productId: p.id, quantity: 1 }]);
    const text = await res.text();
    expect(text).not.toMatch(/cost/i);
    const { receipt } = JSON.parse(text) as { receipt: Receipt };
    expect(await (await getWithCookie(`/sales/${receipt.id}`, owner.cookie)).text()).not.toMatch(
      /cost/i,
    );
    // Cost is still kept in the sale line for profit reports.
    const row = await env.DB.prepare('SELECT unit_cost_cents FROM sale_items WHERE sale_id = ?')
      .bind(receipt.id)
      .first<{ unit_cost_cents: number }>();
    expect(row?.unit_cost_cents).toBe(600);
  });

  it('a deactivated cashier cannot sell, and an empty cart is refused', async () => {
    const owner = await signUp();
    const staff = await addMember(owner, 'staff');
    const p = await createProductAs(owner.cookie, { stock: 5 });
    expect((await sell(owner.cookie, [])).status).toBe(400);
    await postJson(`/staff/${staff.id}/deactivate`, {}, owner.cookie);
    expect((await sell(staff.cookie, [{ productId: p.id, quantity: 1 }])).status).toBe(401);
    expect(await stockOf(p.id)).toBe(5);
  });
});
