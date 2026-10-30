import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import type { Receipt } from '../../src/shared/schemas/sales';
import { addMember, createProductAs, getWithCookie, postJson, signUp } from './helpers';

const key = () => crypto.randomUUID().replace(/-/g, '');

function sell(cookie: string, body: Record<string, unknown>) {
  return postJson('/sales', { idempotencyKey: key(), paymentMethod: 'cash', ...body }, cookie);
}

async function stockOf(id: string) {
  return (
    await env.DB.prepare('SELECT stock FROM products WHERE id = ?')
      .bind(id)
      .first<{ stock: number }>()
  )?.stock;
}

async function saleCount(shopId: string) {
  return (
    await env.DB.prepare('SELECT COUNT(*) AS n FROM sales WHERE shop_id = ?')
      .bind(shopId)
      .first<{ n: number }>()
  )?.n;
}

describe('POST /sales', () => {
  it('prices from the database, takes stock, logs movements and numbers sales per shop', async () => {
    const owner = await signUp();
    const staff = await addMember(owner, 'staff');
    const latte = await createProductAs(owner.cookie, {
      name: 'Latte',
      priceCents: 12_000,
      stock: 10,
    });
    const bread = await createProductAs(owner.cookie, {
      name: 'Bread',
      priceCents: 4_550,
      stock: 5,
    });

    const res = await sell(staff.cookie, {
      items: [
        { productId: latte.id, quantity: 2 },
        { productId: bread.id, quantity: 1 },
      ],
      cashReceivedCents: 30_000,
    });
    expect(res.status).toBe(201);
    const { receipt } = await res.json<{ receipt: Receipt }>();
    expect(receipt).toMatchObject({
      number: 1,
      status: 'completed',
      cashier: { id: staff.id },
      subtotalCents: 28_550,
      discountCents: 0,
      totalCents: 28_550,
      paymentMethod: 'cash',
      cashReceivedCents: 30_000,
      changeCents: 1_450,
    });
    expect(
      receipt.lines.map((l) => [l.name, l.quantity, l.unitPriceCents, l.lineTotalCents]),
    ).toEqual([
      ['Latte', 2, 12_000, 24_000],
      ['Bread', 1, 4_550, 4_550],
    ]);
    expect(await stockOf(latte.id)).toBe(8);
    expect(await stockOf(bread.id)).toBe(4);
    const moves = await env.DB.prepare(
      "SELECT delta, sale_id FROM stock_movements WHERE product_id = ? AND reason = 'sale'",
    )
      .bind(latte.id)
      .all<{ delta: number; sale_id: string }>();
    expect(moves.results).toEqual([{ delta: -2, sale_id: receipt.id }]);

    const second = await sell(staff.cookie, { items: [{ productId: bread.id, quantity: 1 }] });
    expect((await second.json<{ receipt: Receipt }>()).receipt.number).toBe(2);

    const other = await signUp();
    const p = await createProductAs(other.cookie, { stock: 3 });
    const first = await sell(other.cookie, { items: [{ productId: p.id, quantity: 1 }] });
    expect((await first.json<{ receipt: Receipt }>()).receipt.number).toBe(1);
  });

  it('ignores nothing it should not trust: prices, totals or shop sent by the client are refused', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie, { priceCents: 10_000, stock: 5 });
    for (const extra of [
      { items: [{ productId: p.id, quantity: 1, priceCents: 1 }] },
      { items: [{ productId: p.id, quantity: 1 }], totalCents: 1 },
      { items: [{ productId: p.id, quantity: 1 }], shopId: 'x' },
    ]) {
      expect((await sell(owner.cookie, extra)).status, JSON.stringify(extra)).toBe(400);
    }
    expect(await stockOf(p.id)).toBe(5);
  });

  it('cash: exact cash by default, change computed, short cash refused', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie, { priceCents: 9_950, stock: 5 });
    const exact = await (
      await sell(owner.cookie, { items: [{ productId: p.id, quantity: 1 }] })
    ).json<{ receipt: Receipt }>();
    expect(exact.receipt).toMatchObject({ cashReceivedCents: 9_950, changeCents: 0 });

    const short = await sell(owner.cookie, {
      items: [{ productId: p.id, quantity: 1 }],
      cashReceivedCents: 5_000,
    });
    expect(short.status).toBe(400);
    expect(await short.json()).toMatchObject({ error: { code: 'CASH_SHORT' } });
  });

  it('other payment methods: manual is allowed with a reference, unknown ones are not', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie, { priceCents: 1_000, stock: 5 });
    const manual = await sell(owner.cookie, {
      items: [{ productId: p.id, quantity: 1 }],
      paymentMethod: 'other_manual',
      paymentReference: 'GCash 1234',
    });
    expect(await manual.json()).toMatchObject({
      receipt: { paymentMethod: 'other_manual', paymentReference: 'GCash 1234', changeCents: null },
    });
    const card = await sell(owner.cookie, {
      items: [{ productId: p.id, quantity: 1 }],
      paymentMethod: 'card',
    });
    expect(card.status).toBe(400);
  });

  it('discounts: admins can, staff cannot, and never more than the subtotal', async () => {
    const owner = await signUp();
    const staff = await addMember(owner, 'staff');
    const p = await createProductAs(owner.cookie, { priceCents: 10_000, stock: 9 });
    const item = [{ productId: p.id, quantity: 1 }];
    expect((await sell(staff.cookie, { items: item, discountCents: 500 })).status).toBe(403);
    expect((await sell(owner.cookie, { items: item, discountCents: 20_000 })).status).toBe(400);
    const ok = await sell(owner.cookie, { items: item, discountCents: 1_000 });
    expect(await ok.json()).toMatchObject({
      receipt: { subtotalCents: 10_000, discountCents: 1_000, totalCents: 9_000 },
    });
  });

  it('refuses to oversell, names the product, and leaves nothing behind', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie, {
      name: 'Oil filter',
      priceCents: 30_000,
      stock: 2,
    });
    const other = await createProductAs(owner.cookie, { name: 'Plug', priceCents: 100, stock: 9 });
    const res = await sell(owner.cookie, {
      items: [
        { productId: other.id, quantity: 1 },
        { productId: p.id, quantity: 3 },
      ],
    });
    expect(res.status).toBe(409);
    const body = await res.json<{ error: { code: string; message: string } }>();
    expect(body.error.code).toBe('STOCK_INSUFFICIENT');
    expect(body.error.message).toContain('Oil filter (2 left)');
    expect(await stockOf(p.id)).toBe(2);
    expect(await stockOf(other.id)).toBe(9);
    expect(await saleCount(owner.shopId)).toBe(0);

    // The failed sale didn't use up a number.
    const ok = await sell(owner.cookie, { items: [{ productId: p.id, quantity: 1 }] });
    expect((await ok.json<{ receipt: Receipt }>()).receipt.number).toBe(1);
  });

  it('two tills selling the last item at once: one sale, never negative stock', async () => {
    const owner = await signUp();
    const a = await addMember(owner, 'staff');
    const b = await addMember(owner, 'staff');
    const p = await createProductAs(owner.cookie, { priceCents: 500, stock: 1 });
    const results = await Promise.all([
      sell(a.cookie, { items: [{ productId: p.id, quantity: 1 }] }),
      sell(b.cookie, { items: [{ productId: p.id, quantity: 1 }] }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await stockOf(p.id)).toBe(0);
    expect(await saleCount(owner.shopId)).toBe(1);
  });

  it('sells untracked items without touching stock, and merges repeated lines', async () => {
    const owner = await signUp();
    const labor = await createProductAs(owner.cookie, {
      name: 'Labor',
      priceCents: 30_000,
      trackStock: false,
    });
    const p = await createProductAs(owner.cookie, { priceCents: 100, stock: 10 });
    const res = await sell(owner.cookie, {
      items: [
        { productId: labor.id, quantity: 1 },
        { productId: p.id, quantity: 2 },
        { productId: p.id, quantity: 3 },
      ],
    });
    const { receipt } = await res.json<{ receipt: Receipt }>();
    expect(receipt.lines.map((l) => [l.name, l.quantity])).toEqual([
      ['Labor', 1],
      ['Iced Latte', 5],
    ]);
    expect(await stockOf(p.id)).toBe(5);
  });

  it("refuses archived products and other shops' products", async () => {
    const a = await signUp();
    const b = await signUp();
    const archived = await createProductAs(a.cookie, { stock: 5 });
    await postJson(`/products/${archived.id}/archive`, {}, a.cookie);
    const bp = await createProductAs(b.cookie, { stock: 5 });
    for (const id of [archived.id, bp.id]) {
      const res = await sell(a.cookie, { items: [{ productId: id, quantity: 1 }] });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: { code: 'UNKNOWN_PRODUCT' } });
    }
    expect(await stockOf(bp.id)).toBe(5);
  });
});

describe('GET /sales/:id', () => {
  it('staff see their own receipts, admins see all, other shops see none', async () => {
    const owner = await signUp();
    const a = await addMember(owner, 'staff');
    const b = await addMember(owner, 'staff');
    const p = await createProductAs(owner.cookie, { stock: 5 });
    const { receipt } = await (
      await sell(a.cookie, { items: [{ productId: p.id, quantity: 1 }] })
    ).json<{ receipt: Receipt }>();

    expect((await getWithCookie(`/sales/${receipt.id}`, a.cookie)).status).toBe(200);
    expect((await getWithCookie(`/sales/${receipt.id}`, owner.cookie)).status).toBe(200);
    expect((await getWithCookie(`/sales/${receipt.id}`, b.cookie)).status).toBe(404);
    const other = await signUp();
    expect((await getWithCookie(`/sales/${receipt.id}`, other.cookie)).status).toBe(404);
  });
});

describe('idempotency', () => {
  it('the same key twice returns the first sale: one sale, stock taken once', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie, { priceCents: 1_000, stock: 5 });
    const body = { idempotencyKey: 'retry-key-123', items: [{ productId: p.id, quantity: 2 }] };
    const first = await sell(owner.cookie, body);
    const again = await sell(owner.cookie, body);
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    const a = await first.json<{ receipt: Receipt; replayed: boolean }>();
    const b = await again.json<{ receipt: Receipt; replayed: boolean }>();
    expect(b.replayed).toBe(true);
    expect(b.receipt).toEqual(a.receipt);
    expect(await saleCount(owner.shopId)).toBe(1);
    expect(await stockOf(p.id)).toBe(3);
  });

  it('a replay returns the original even if the cart sent the second time differs', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie, { priceCents: 1_000, stock: 5 });
    const k = 'same-key-456';
    await sell(owner.cookie, { idempotencyKey: k, items: [{ productId: p.id, quantity: 1 }] });
    const again = await sell(owner.cookie, {
      idempotencyKey: k,
      items: [{ productId: p.id, quantity: 4 }],
    });
    expect((await again.json<{ receipt: Receipt }>()).receipt.lines[0]?.quantity).toBe(1);
    expect(await stockOf(p.id)).toBe(4);
  });

  it('two copies arriving at the same moment still make one sale', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie, { priceCents: 1_000, stock: 5 });
    const body = { idempotencyKey: 'burst-key-789', items: [{ productId: p.id, quantity: 1 }] };
    const results = await Promise.all([
      sell(owner.cookie, body),
      sell(owner.cookie, body),
      sell(owner.cookie, body),
    ]);
    expect(results.every((r) => r.status === 200 || r.status === 201)).toBe(true);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await saleCount(owner.shopId)).toBe(1);
    expect(await stockOf(p.id)).toBe(4);
  });

  it("keys are per shop, and another cashier's key is refused", async () => {
    const a = await signUp();
    const b = await signUp();
    const pa = await createProductAs(a.cookie, { stock: 5 });
    const pb = await createProductAs(b.cookie, { stock: 5 });
    const k = 'shared-key-000';
    expect(
      (await sell(a.cookie, { idempotencyKey: k, items: [{ productId: pa.id, quantity: 1 }] }))
        .status,
    ).toBe(201);
    expect(
      (await sell(b.cookie, { idempotencyKey: k, items: [{ productId: pb.id, quantity: 1 }] }))
        .status,
    ).toBe(201);

    const staff = await addMember(a, 'staff');
    const res = await sell(staff.cookie, {
      idempotencyKey: k,
      items: [{ productId: pa.id, quantity: 1 }],
    });
    expect(res.status).toBe(409);
  });
});

describe('POST /sales/:id/void', () => {
  function voidSale(id: string, cookie: string, reason = 'Customer changed their mind') {
    return postJson(`/sales/${id}/void`, { reason }, cookie);
  }

  it('voids with a reason, keeps the number, restocks tracked items and logs it', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie, { priceCents: 1_000, stock: 5 });
    const labor = await createProductAs(owner.cookie, { priceCents: 5_000, trackStock: false });
    const { receipt } = await (
      await sell(owner.cookie, {
        items: [
          { productId: p.id, quantity: 2 },
          { productId: labor.id, quantity: 1 },
        ],
      })
    ).json<{ receipt: Receipt }>();
    expect(await stockOf(p.id)).toBe(3);

    const res = await voidSale(receipt.id, owner.cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      receipt: {
        number: receipt.number,
        status: 'voided',
        voidReason: 'Customer changed their mind',
      },
    });
    expect(await stockOf(p.id)).toBe(5);
    const moves = await env.DB.prepare(
      "SELECT delta, sale_id FROM stock_movements WHERE product_id = ? AND reason = 'void'",
    )
      .bind(p.id)
      .all();
    expect(moves.results).toEqual([{ delta: 2, sale_id: receipt.id }]);
    const audit = await env.DB.prepare(
      "SELECT details_json FROM audit_log WHERE shop_id = ? AND action = 'sale.void'",
    )
      .bind(owner.shopId)
      .all<{ details_json: string }>();
    expect(audit.results).toHaveLength(1);
    expect(JSON.parse(audit.results[0]?.details_json ?? '{}')).toMatchObject({ number: 1 });

    // The next sale gets a new number; the voided one keeps #1.
    const next = await sell(owner.cookie, { items: [{ productId: p.id, quantity: 1 }] });
    expect((await next.json<{ receipt: Receipt }>()).receipt.number).toBe(2);
  });

  it('voiding twice, even at the same moment, restocks once', async () => {
    const owner = await signUp();
    const admin = await addMember(owner, 'admin');
    const p = await createProductAs(owner.cookie, { priceCents: 1_000, stock: 5 });
    const { receipt } = await (
      await sell(owner.cookie, { items: [{ productId: p.id, quantity: 3 }] })
    ).json<{ receipt: Receipt }>();
    const results = await Promise.all([
      voidSale(receipt.id, owner.cookie),
      voidSale(receipt.id, admin.cookie),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await stockOf(p.id)).toBe(5);
    const again = await voidSale(receipt.id, owner.cookie);
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ error: { code: 'ALREADY_VOIDED' } });
    expect(await stockOf(p.id)).toBe(5);
    const logged = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM audit_log WHERE shop_id = ? AND action = 'sale.void'",
    )
      .bind(owner.shopId)
      .first<{ n: number }>();
    expect(logged?.n).toBe(1);
  });

  it('needs a reason, is for admins only, and never reaches another shop', async () => {
    const owner = await signUp();
    const staff = await addMember(owner, 'staff');
    const p = await createProductAs(owner.cookie, { stock: 5 });
    const { receipt } = await (
      await sell(staff.cookie, { items: [{ productId: p.id, quantity: 1 }] })
    ).json<{ receipt: Receipt }>();
    expect((await voidSale(receipt.id, owner.cookie, '')).status).toBe(400);
    expect((await voidSale(receipt.id, staff.cookie)).status).toBe(403);
    const other = await signUp();
    expect((await voidSale(receipt.id, other.cookie)).status).toBe(404);
    expect(await stockOf(p.id)).toBe(4);
  });
});
