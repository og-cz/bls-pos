import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import {
  addMember,
  fillProducts,
  api,
  createProductAs,
  getWithCookie,
  postJson,
  signUp,
} from './helpers';

type Category = { id: string; name: string; sortOrder: number };

async function createCategory(cookie: string, name: string, sortOrder?: number) {
  const res = await postJson('/categories', { name, sortOrder }, cookie);
  expect(res.status).toBe(201);
  return (await res.json<{ category: Category }>()).category;
}

const send = (method: string, path: string, cookie: string, body?: unknown) =>
  api(path, {
    method,
    headers: { cookie, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

describe('categories', () => {
  it('creates and lists categories by sort order, then name', async () => {
    const owner = await signUp();
    await createCategory(owner.cookie, 'Snacks', 1);
    await createCategory(owner.cookie, 'drinks', 1);
    await createCategory(owner.cookie, 'Promos', 0);
    const staff = await addMember(owner, 'staff');
    const { categories } = await (
      await getWithCookie('/categories', staff.cookie)
    ).json<{ categories: Category[] }>();
    expect(categories.map((c) => c.name)).toEqual(['Promos', 'drinks', 'Snacks']);
  });

  it('keeps names unique per shop', async () => {
    const a = await signUp();
    const b = await signUp();
    await createCategory(a.cookie, 'Drinks');
    await createCategory(b.cookie, 'Drinks');
    const dup = await postJson('/categories', { name: 'Drinks' }, a.cookie);
    expect(dup.status).toBe(409);
    expect(await dup.json()).toMatchObject({ error: { code: 'CATEGORY_TAKEN' } });
  });

  it('renames a category', async () => {
    const owner = await signUp();
    const cat = await createCategory(owner.cookie, 'Drnks');
    const res = await send('PATCH', `/categories/${cat.id}`, owner.cookie, { name: 'Drinks' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ category: { name: 'Drinks', sortOrder: 0 } });
  });

  it('deleting a category keeps its products, just uncategorized', async () => {
    const owner = await signUp();
    const cat = await createCategory(owner.cookie, 'Drinks');
    const p = await createProductAs(owner.cookie, { categoryId: cat.id });
    expect((await send('DELETE', `/categories/${cat.id}`, owner.cookie)).status).toBe(200);

    const row = await env.DB.prepare('SELECT category_id FROM products WHERE id = ?')
      .bind(p.id)
      .first<{ category_id: string | null }>();
    expect(row?.category_id).toBeNull();
    const { categories } = await (
      await getWithCookie('/categories', owner.cookie)
    ).json<{ categories: Category[] }>();
    expect(categories).toEqual([]);
  });

  it("can't see or change another shop's categories", async () => {
    const a = await signUp();
    const b = await signUp();
    const bCat = await createCategory(b.cookie, 'B only');
    const list = await (await getWithCookie('/categories', a.cookie)).text();
    expect(list).not.toContain('B only');
    expect((await send('PATCH', `/categories/${bCat.id}`, a.cookie, { name: 'x' })).status).toBe(
      404,
    );
    expect((await send('DELETE', `/categories/${bCat.id}`, a.cookie)).status).toBe(404);
  });

  it('only admins and the owner change categories', async () => {
    const owner = await signUp();
    const staff = await addMember(owner, 'staff');
    expect((await postJson('/categories', { name: 'X' }, staff.cookie)).status).toBe(403);
  });
});

describe('product archiving', () => {
  it('archived products leave the normal list, keep their data, and can be restored', async () => {
    const owner = await signUp();
    const staff = await addMember(owner, 'staff');
    const p = await createProductAs(owner.cookie, { name: 'Old Blend', stock: 4 });

    const res = await postJson(`/products/${p.id}/archive`, {}, owner.cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ product: { archived: true, stock: 4 } });

    const active = await (await getWithCookie('/products', owner.cookie)).text();
    expect(active).not.toContain('Old Blend');
    const archived = await (await getWithCookie('/products?archived=true', owner.cookie)).text();
    expect(archived).toContain('Old Blend');

    // Staff never see archived products, even if they ask.
    expect(
      await (await getWithCookie('/products?archived=true', staff.cookie)).text(),
    ).not.toContain('Old Blend');
    expect((await getWithCookie(`/products/${p.id}`, staff.cookie)).status).toBe(404);

    const back = await postJson(`/products/${p.id}/unarchive`, {}, owner.cookie);
    expect(await back.json()).toMatchObject({ product: { archived: false } });
    expect(await (await getWithCookie('/products', staff.cookie)).text()).toContain('Old Blend');
  });

  it('is logged and safe to repeat', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie);
    await postJson(`/products/${p.id}/archive`, {}, owner.cookie);
    await postJson(`/products/${p.id}/archive`, {}, owner.cookie);
    const rows = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM audit_log WHERE shop_id = ? AND action = 'product.archive'",
    )
      .bind(owner.shopId)
      .first<{ n: number }>();
    expect(rows?.n).toBe(1);
  });

  it('restoring respects the product limit', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie);
    await postJson(`/products/${p.id}/archive`, {}, owner.cookie);
    await fillProducts(owner.shopId, 5000);
    const res = await postJson(`/products/${p.id}/unarchive`, {}, owner.cookie);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'PRODUCT_LIMIT_REACHED' } });
  });

  it("can't archive another shop's product; staff can't archive", async () => {
    const a = await signUp();
    const b = await signUp();
    const bp = await createProductAs(b.cookie);
    expect((await postJson(`/products/${bp.id}/archive`, {}, a.cookie)).status).toBe(404);
    const staff = await addMember(b, 'staff');
    expect((await postJson(`/products/${bp.id}/archive`, {}, staff.cookie)).status).toBe(403);
  });
});
