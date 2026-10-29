import { describe, expect, it } from 'vitest';

import { stockStatus } from '../../src/shared/schemas/products';
import { addMember, api, createProductAs, getWithCookie, postJson, signUp } from './helpers';

type List = { products: { name: string; stockStatus: string }[] };

describe('stockStatus', () => {
  it('is out at zero, low at or below the threshold, ok above it', () => {
    const s = (stock: number, trackStock = true) =>
      stockStatus({ trackStock, stock, lowStockThreshold: 5 });
    expect([s(0), s(1), s(5), s(6), s(0, false)]).toEqual(['out', 'low', 'low', 'ok', 'untracked']);
  });
});

describe('low-stock alerts', () => {
  it('lists low and out-of-stock products and counts them', async () => {
    const owner = await signUp();
    const staff = await addMember(owner, 'staff');
    await createProductAs(owner.cookie, { name: 'Plenty', stock: 50 });
    await createProductAs(owner.cookie, { name: 'Running low', stock: 3 });
    await createProductAs(owner.cookie, {
      name: 'Custom threshold',
      stock: 15,
      lowStockThreshold: 20,
    });
    await createProductAs(owner.cookie, { name: 'Sold out', stock: 0 });
    await createProductAs(owner.cookie, { name: 'Made to order', trackStock: false });
    const archived = await createProductAs(owner.cookie, { name: 'Archived empty', stock: 0 });
    await postJson(`/products/${archived.id}/archive`, {}, owner.cookie);

    const names = async (q: string) =>
      (await (await getWithCookie(`/products?stock=${q}`, staff.cookie)).json<List>()).products.map(
        (p) => `${p.name}:${p.stockStatus}`,
      );
    expect(await names('low')).toEqual(['Custom threshold:low', 'Running low:low', 'Sold out:out']);
    expect(await names('out')).toEqual(['Sold out:out']);

    const alerts = await (await getWithCookie('/inventory/alerts', staff.cookie)).json();
    expect(alerts).toEqual({ low: 2, out: 1 });
  });

  it('updates as stock moves, and the threshold moves a product in or out', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie, { name: 'Beans', stock: 6 });
    const deduct = await postJson(
      '/inventory/deduct',
      { productId: p.id, quantity: 1, reason: 'used' },
      owner.cookie,
    );
    expect(await deduct.json()).toMatchObject({ stock: 5, stockStatus: 'low' });
    expect(await (await getWithCookie('/inventory/alerts', owner.cookie)).json()).toEqual({
      low: 1,
      out: 0,
    });

    await api(`/products/${p.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: owner.cookie },
      body: JSON.stringify({ lowStockThreshold: 2 }),
    });
    expect(await (await getWithCookie('/inventory/alerts', owner.cookie)).json()).toEqual({
      low: 0,
      out: 0,
    });
  });

  it("only counts this shop's products", async () => {
    const a = await signUp();
    const b = await signUp();
    await createProductAs(b.cookie, { stock: 0 });
    expect(await (await getWithCookie('/inventory/alerts', a.cookie)).json()).toEqual({
      low: 0,
      out: 0,
    });
  });
});
