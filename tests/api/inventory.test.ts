import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { addMember, createProductAs, getWithCookie, postJson, signUp } from './helpers';

type Movements = {
  movements: {
    product: { name: string };
    user: { id: string };
    delta: number;
    reason: string;
    note: string | null;
  }[];
  nextCursor: string | null;
};

async function stockOf(id: string) {
  const row = await env.DB.prepare('SELECT stock FROM products WHERE id = ?')
    .bind(id)
    .first<{ stock: number }>();
  return row?.stock;
}

describe('POST /inventory/restock', () => {
  it('adds stock and logs who, how many and why', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie, { stock: 2 });
    const res = await postJson(
      '/inventory/restock',
      { productId: p.id, quantity: 10, note: 'Delivery from supplier' },
      owner.cookie,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ productId: p.id, stock: 12 });

    const { movements } = await (
      await getWithCookie(`/inventory/movements?productId=${p.id}`, owner.cookie)
    ).json<Movements>();
    expect(movements.map((m) => [m.delta, m.reason, m.note])).toEqual([
      [10, 'restock', 'Delivery from supplier'],
      [2, 'restock', 'Opening stock'],
    ]);
  });

  it('is for admins and the owner only', async () => {
    const owner = await signUp();
    const staff = await addMember(owner, 'staff');
    const p = await createProductAs(owner.cookie);
    const res = await postJson(
      '/inventory/restock',
      { productId: p.id, quantity: 5 },
      staff.cookie,
    );
    expect(res.status).toBe(403);
    expect(await stockOf(p.id)).toBe(0);
  });

  it('validates the quantity', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie);
    for (const quantity of [0, -5, 1.5, '3', 2_000_000]) {
      const res = await postJson('/inventory/restock', { productId: p.id, quantity }, owner.cookie);
      expect(res.status, String(quantity)).toBe(400);
    }
  });
});

describe('POST /inventory/deduct', () => {
  it('lets staff take stock out with a reason', async () => {
    const owner = await signUp();
    const staff = await addMember(owner, 'staff');
    const p = await createProductAs(owner.cookie, { stock: 5 });
    const res = await postJson(
      '/inventory/deduct',
      { productId: p.id, quantity: 2, reason: 'damaged', note: 'Dropped' },
      staff.cookie,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ productId: p.id, stock: 3 });

    const audit = await env.DB.prepare(
      "SELECT user_id, details_json FROM audit_log WHERE shop_id = ? AND action = 'stock.deduct'",
    )
      .bind(owner.shopId)
      .first<{ user_id: string; details_json: string }>();
    expect(audit?.user_id).toBe(staff.id);
    expect(JSON.parse(audit?.details_json ?? '{}')).toMatchObject({ delta: -2, reason: 'damaged' });
  });

  it('requires one of the listed reasons', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie, { stock: 5 });
    for (const reason of [undefined, '', 'restock', 'sale', 'gift']) {
      const res = await postJson(
        '/inventory/deduct',
        { productId: p.id, quantity: 1, reason },
        owner.cookie,
      );
      expect(res.status, String(reason)).toBe(400);
    }
    expect(await stockOf(p.id)).toBe(5);
  });

  it('never goes below zero, and a refused deduct leaves no movement behind', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie, { stock: 2 });
    const res = await postJson(
      '/inventory/deduct',
      { productId: p.id, quantity: 3, reason: 'lost' },
      owner.cookie,
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'STOCK_INSUFFICIENT' } });
    expect(await stockOf(p.id)).toBe(2);
    const moves = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM stock_movements WHERE product_id = ? AND reason = 'lost'",
    )
      .bind(p.id)
      .first<{ n: number }>();
    expect(moves?.n).toBe(0);
  });

  it('two cashiers deducting the last items at once never produce negative stock', async () => {
    const owner = await signUp();
    const a = await addMember(owner, 'staff');
    const b = await addMember(owner, 'staff');
    const p = await createProductAs(owner.cookie, { stock: 3 });
    const body = { productId: p.id, quantity: 2, reason: 'used' };
    const results = await Promise.all([
      postJson('/inventory/deduct', body, a.cookie),
      postJson('/inventory/deduct', body, b.cookie),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await stockOf(p.id)).toBe(1);
  });

  it("refuses untracked, archived and other shops' products", async () => {
    const a = await signUp();
    const b = await signUp();
    const untracked = await createProductAs(a.cookie, { trackStock: false });
    const archived = await createProductAs(a.cookie, { stock: 5 });
    await postJson(`/products/${archived.id}/archive`, {}, a.cookie);
    const bp = await createProductAs(b.cookie, { stock: 5 });
    const deduct = (productId: string) =>
      postJson('/inventory/deduct', { productId, quantity: 1, reason: 'used' }, a.cookie);

    expect((await deduct(untracked.id)).status).toBe(409);
    expect((await deduct(archived.id)).status).toBe(404);
    expect((await deduct(bp.id)).status).toBe(404);
    expect(await stockOf(bp.id)).toBe(5);
  });
});

describe('GET /inventory/movements', () => {
  it('shows staff only their own movements, admins everything', async () => {
    const owner = await signUp();
    const staff = await addMember(owner, 'staff');
    const p = await createProductAs(owner.cookie, { stock: 10 });
    await postJson(
      '/inventory/deduct',
      { productId: p.id, quantity: 1, reason: 'used' },
      staff.cookie,
    );

    const mine = await (
      await getWithCookie('/inventory/movements', staff.cookie)
    ).json<Movements>();
    expect(mine.movements.map((m) => [m.user.id, m.delta])).toEqual([[staff.id, -1]]);

    const all = await (await getWithCookie('/inventory/movements', owner.cookie)).json<Movements>();
    expect(all.movements.map((m) => m.delta)).toEqual([-1, 10]);
  });

  it('pages with a cursor and stays inside the shop', async () => {
    const a = await signUp();
    const b = await signUp();
    const p = await createProductAs(a.cookie, { stock: 1 });
    for (let i = 0; i < 3; i++) {
      await postJson('/inventory/restock', { productId: p.id, quantity: 1 }, a.cookie);
    }
    await createProductAs(b.cookie, { name: 'B secret stock', stock: 9 });

    const first = await (
      await getWithCookie('/inventory/movements?limit=2', a.cookie)
    ).json<Movements>();
    expect(first.movements).toHaveLength(2);
    const second = await (
      await getWithCookie(`/inventory/movements?limit=2&cursor=${first.nextCursor ?? ''}`, a.cookie)
    ).json<Movements>();
    expect(second.movements).toHaveLength(2);
    expect(second.nextCursor).toBeNull();
    expect(JSON.stringify([first, second])).not.toContain('B secret stock');
  });
});
