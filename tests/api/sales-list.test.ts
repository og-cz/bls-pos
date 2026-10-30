import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { safeRows } from '../../src/shared/export';
import type { Receipt, SaleList } from '../../src/shared/schemas/sales';
import { addDays, dayStartMs, localDay } from '../../src/shared/time';
import { addMember, createProductAs, getWithCookie, postJson, signUp } from './helpers';

const TZ = 'Asia/Manila';
const key = () => crypto.randomUUID().replace(/-/g, '');

async function sell(cookie: string, productId: string, quantity = 1, day?: string) {
  const res = await postJson(
    '/sales',
    { idempotencyKey: key(), paymentMethod: 'cash', items: [{ productId, quantity }] },
    cookie,
  );
  const { receipt } = await res.json<{ receipt: Receipt }>();
  if (day) {
    await env.DB.prepare('UPDATE sales SET created_at = ? WHERE id = ?')
      .bind(dayStartMs(day, TZ) + 3_600_000, receipt.id)
      .run();
  }
  return receipt;
}

async function list(cookie: string, query = '') {
  const res = await getWithCookie(`/sales${query}`, cookie);
  expect(res.status).toBe(200);
  return res.json<SaleList>();
}

describe('sales list', () => {
  it('staff see only their own sales from today, whatever they ask for', async () => {
    const owner = await signUp();
    const staff = await addMember(owner, 'staff');
    const p = await createProductAs(owner.cookie, { priceCents: 1_000, stock: 50 });
    const today = localDay(Date.now(), TZ);
    const mine = await sell(staff.cookie, p.id, 2);
    await sell(staff.cookie, p.id, 1, addDays(today, -1)); // yesterday
    await sell(owner.cookie, p.id, 1); // someone else's

    const shift = await list(
      staff.cookie,
      `?from=${addDays(today, -5)}&to=${today}&userId=${owner.userId}`,
    );
    expect(shift.from).toBe(today);
    expect(shift.sales.map((s) => s.id)).toEqual([mine.id]);
    expect(shift.sales[0]).toMatchObject({ itemCount: 2, totalCents: 2_000 });
    expect(shift.totals).toEqual({
      salesCount: 1,
      grossCents: 2_000,
      voidedCount: 0,
      voidedCents: 0,
    });
  });

  it('admins see everyone, filter by cashier and range, and page', async () => {
    const owner = await signUp();
    const staff = await addMember(owner, 'staff');
    const p = await createProductAs(owner.cookie, { priceCents: 100, stock: 50 });
    for (let i = 0; i < 3; i++) await sell(staff.cookie, p.id, 1, '2026-10-10');
    const v = await sell(owner.cookie, p.id, 1, '2026-10-10');
    await postJson(`/sales/${v.id}/void`, { reason: 'Mistake' }, owner.cookie);

    const all = await list(owner.cookie, '?from=2026-10-10&to=2026-10-10');
    expect(all.sales.map((s) => s.number)).toEqual([4, 3, 2, 1]);
    expect(all.sales[0]).toMatchObject({ status: 'voided', voidReason: 'Mistake' });
    expect(all.totals).toMatchObject({ salesCount: 3, voidedCount: 1, voidedCents: 100 });

    const byStaff = await list(owner.cookie, `?from=2026-10-10&userId=${staff.id}`);
    expect(byStaff.sales).toHaveLength(3);

    const first = await list(owner.cookie, '?from=2026-10-10&limit=3');
    expect(first.sales.map((s) => s.number)).toEqual([4, 3, 2]);
    expect(first.nextBefore).toBe(2);
    const second = await list(owner.cookie, `?from=2026-10-10&limit=3&before=2`);
    expect(second.sales.map((s) => s.number)).toEqual([1]);
    expect(second.nextBefore).toBeNull();

    expect((await list(owner.cookie, '?from=2026-10-11')).sales).toEqual([]);
  });

  it('never shows another shop’s sales, and checks the filter', async () => {
    const a = await signUp();
    const b = await signUp();
    const p = await createProductAs(a.cookie, { stock: 5 });
    await sell(a.cookie, p.id);
    expect((await list(b.cookie)).sales).toEqual([]);
    expect((await getWithCookie('/sales?limit=999', a.cookie)).status).toBe(400);
    expect((await getWithCookie('/sales?from=2026-10-02&to=2026-10-01', a.cookie)).status).toBe(
      400,
    );
    expect((await getWithCookie('/sales?shopId=x', a.cookie)).status).toBe(400);
  });

  it('a sales export is logged, and a cashier name cannot run as a formula', async () => {
    const owner = await signUp();
    const res = await postJson(
      '/audit/exports',
      { kind: 'sales', format: 'csv', rows: 4 },
      owner.cookie,
    );
    expect(res.status).toBe(200);
    const log = await env.DB.prepare(
      "SELECT details_json AS details FROM audit_log WHERE shop_id = ? AND action = 'data.export'",
    )
      .bind(owner.shopId)
      .first<{ details: string }>();
    expect(JSON.parse(log?.details ?? '{}')).toMatchObject({ kind: 'sales', rows: 4 });
    expect(safeRows([['=HYPERLINK("x")', 12.5]])).toEqual([['\'=HYPERLINK("x")', 12.5]]);
  });
});
