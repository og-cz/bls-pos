import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { addMember, createProductAs, getWithCookie, postJson, signUp } from './helpers';

type Movements = { movements: { user: { id: string }; delta: number; product: { id: string } }[] };

async function movementsOf(productId: string) {
  const { results } = await env.DB.prepare(
    'SELECT delta, reason FROM stock_movements WHERE product_id = ? ORDER BY id',
  )
    .bind(productId)
    .all<{ delta: number; reason: string }>();
  return results;
}

describe('stock movement rules', () => {
  it('stock always equals the sum of its movements', async () => {
    const owner = await signUp();
    const staff = await addMember(owner, 'staff');
    const p = await createProductAs(owner.cookie, { stock: 10 });
    await postJson('/inventory/restock', { productId: p.id, quantity: 5 }, owner.cookie);
    await postJson(
      '/inventory/deduct',
      { productId: p.id, quantity: 3, reason: 'expired' },
      staff.cookie,
    );
    // A refused change must not leave a movement behind.
    await postJson(
      '/inventory/deduct',
      { productId: p.id, quantity: 99, reason: 'lost' },
      staff.cookie,
    );

    const moves = await movementsOf(p.id);
    const row = await env.DB.prepare('SELECT stock FROM products WHERE id = ?')
      .bind(p.id)
      .first<{ stock: number }>();
    expect(moves.reduce((sum, m) => sum + m.delta, 0)).toBe(row?.stock);
    expect(row?.stock).toBe(12);
  });

  it('parallel restocks all count', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie);
    await Promise.all(
      Array.from({ length: 5 }, () =>
        postJson('/inventory/restock', { productId: p.id, quantity: 2 }, owner.cookie),
      ),
    );
    const row = await env.DB.prepare('SELECT stock FROM products WHERE id = ?')
      .bind(p.id)
      .first<{ stock: number }>();
    expect(row?.stock).toBe(10);
    expect(await movementsOf(p.id)).toHaveLength(5);
  });

  it('untracked products ignore opening stock and refuse stock changes', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie, { trackStock: false, stock: 5 });
    expect(p.stock).toBe(0);
    expect(await movementsOf(p.id)).toEqual([]);
    const res = await postJson(
      '/inventory/restock',
      { productId: p.id, quantity: 1 },
      owner.cookie,
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'STOCK_NOT_TRACKED' } });
  });

  it('archived products refuse restocks but keep their history', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie, { stock: 3 });
    await postJson(`/products/${p.id}/archive`, {}, owner.cookie);
    expect(
      (await postJson('/inventory/restock', { productId: p.id, quantity: 1 }, owner.cookie)).status,
    ).toBe(404);
    const { movements } = await (
      await getWithCookie(`/inventory/movements?productId=${p.id}`, owner.cookie)
    ).json<Movements>();
    expect(movements.map((m) => m.delta)).toEqual([3]);
  });

  it('staff filtering by product still only see their own movements', async () => {
    const owner = await signUp();
    const a = await addMember(owner, 'staff');
    const b = await addMember(owner, 'staff');
    const p = await createProductAs(owner.cookie, { stock: 10 });
    await postJson('/inventory/deduct', { productId: p.id, quantity: 1, reason: 'used' }, a.cookie);
    await postJson('/inventory/deduct', { productId: p.id, quantity: 2, reason: 'used' }, b.cookie);

    const { movements } = await (
      await getWithCookie(`/inventory/movements?productId=${p.id}`, a.cookie)
    ).json<Movements>();
    expect(movements.map((m) => [m.user.id, m.delta])).toEqual([[a.id, -1]]);
  });

  it('notes are plain text with a length limit', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie);
    for (const note of ['x'.repeat(201), 'bad\u0000note']) {
      const res = await postJson(
        '/inventory/restock',
        { productId: p.id, quantity: 1, note },
        owner.cookie,
      );
      expect(res.status).toBe(400);
    }
  });

  it('a deactivated cashier can no longer move stock', async () => {
    const owner = await signUp();
    const staff = await addMember(owner, 'staff');
    const p = await createProductAs(owner.cookie, { stock: 5 });
    await postJson(`/staff/${staff.id}/deactivate`, {}, owner.cookie);
    const res = await postJson(
      '/inventory/deduct',
      { productId: p.id, quantity: 1, reason: 'used' },
      staff.cookie,
    );
    expect(res.status).toBe(401);
  });

  it("movement history never includes another shop's products or users", async () => {
    const a = await signUp();
    const b = await signUp();
    const bp = await createProductAs(b.cookie, { stock: 4 });
    const { movements } = await (
      await getWithCookie(`/inventory/movements?productId=${bp.id}`, a.cookie)
    ).json<Movements>();
    expect(movements).toEqual([]);
  });
});
