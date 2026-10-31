import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { PURGE_AFTER_MS, purgeDeletedShops } from '../../src/worker/purge';
import { addMember, api, createProductAs, getWithCookie, postJson, signUp } from './helpers';

const png = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  ),
  (ch) => ch.charCodeAt(0),
);

async function count(table: string, shopId: string) {
  const row = await env.DB.prepare(`SELECT count(*) AS n FROM ${table} WHERE shop_id = ?`)
    .bind(shopId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

describe('deleting a shop', () => {
  it('needs the owner, the shop code and the password', async () => {
    const owner = await signUp();
    const admin = await addMember(owner, 'admin');
    const body = { shopSlug: owner.body.shopSlug, password: owner.body.password };
    expect((await postJson('/shop/delete', body, admin.cookie)).status).toBe(403);
    const wrong = await postJson(
      '/shop/delete',
      { shopSlug: 'not-my-shop', password: 'nope' },
      owner.cookie,
    );
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toMatchObject({
      error: {
        fields: { shopSlug: expect.any(String) as string, password: expect.any(String) as string },
      },
    });
    expect((await getWithCookie('/me', owner.cookie)).status).toBe(200);
  });

  it('closes the shop at once and erases everything after 30 days', async () => {
    const owner = await signUp();
    const staff = await addMember(owner, 'staff');
    const p = await createProductAs(owner.cookie, { priceCents: 100, stock: 5 });
    await postJson(
      '/sales',
      {
        idempotencyKey: crypto.randomUUID().replace(/-/g, ''),
        paymentMethod: 'cash',
        items: [{ productId: p.id, quantity: 1 }],
      },
      owner.cookie,
    );
    await postJson('/reports/daily-close', { day: '2026-01-01' }, owner.cookie);
    const photo = await (
      await api('/uploads/logo', {
        method: 'POST',
        headers: { 'content-type': 'image/png', cookie: owner.cookie },
        body: png,
      })
    ).json<{ key: string }>();

    const res = await postJson(
      '/shop/delete',
      { shopSlug: owner.body.shopSlug, password: owner.body.password },
      owner.cookie,
    );
    expect(res.status).toBe(200);
    expect((await getWithCookie('/me', owner.cookie)).status).toBe(401);
    expect((await getWithCookie('/me', staff.cookie)).status).toBe(401);
    const login = await postJson('/auth/login', {
      shopSlug: owner.body.shopSlug,
      username: 'juan',
      password: owner.body.password,
      turnstileToken: 'valid-token',
    });
    expect(login.status).toBe(401);

    // Not yet: still within 30 days.
    await purgeDeletedShops(env, Date.now() + PURGE_AFTER_MS - 60_000);
    expect(await count('products', owner.shopId)).toBe(1);

    await purgeDeletedShops(env, Date.now() + PURGE_AFTER_MS + 60_000);
    for (const table of [
      'products',
      'sales',
      'sale_items',
      'audit_log',
      'daily_closings',
      'sessions',
    ]) {
      expect(await count(table, owner.shopId)).toBe(0);
    }
    const shop = await env.DB.prepare('SELECT id FROM shops WHERE id = ?')
      .bind(owner.shopId)
      .first();
    expect(shop).toBeNull();
    expect(await env.MEDIA.head(photo.key)).toBeNull();
  });

  it("other shops are never touched, and a live shop's closings stay locked", async () => {
    const keep = await signUp();
    await createProductAs(keep.cookie, { name: 'Keep me' });
    await postJson('/reports/daily-close', { day: '2026-01-02' }, keep.cookie);
    await purgeDeletedShops(env, Date.now() + 10 * PURGE_AFTER_MS);
    expect(await count('products', keep.shopId)).toBe(1);
    await expect(
      env.DB.prepare('DELETE FROM daily_closings WHERE shop_id = ?').bind(keep.shopId).run(),
    ).rejects.toThrow(/DAY_CLOSED/);
  });
});
