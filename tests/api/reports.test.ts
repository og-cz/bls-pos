import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import type {
  Dashboard,
  IncomeReport,
  StaffSales,
  TopProduct,
} from '../../src/shared/schemas/reports';
import type { Receipt } from '../../src/shared/schemas/sales';
import { addDays, dayStartMs, localDay } from '../../src/shared/time';
import { runNightly } from '../../src/worker/cron';
import { addMember, createProductAs, getWithCookie, postJson, signUp } from './helpers';

const TZ = 'Asia/Manila';
const key = () => crypto.randomUUID().replace(/-/g, '');

/** Sells, then moves the sale to `hour` o'clock (Manila) on `day`. */
async function sellOn(cookie: string, productId: string, quantity: number, day: string, hour = 10) {
  const res = await postJson(
    '/sales',
    { idempotencyKey: key(), paymentMethod: 'cash', items: [{ productId, quantity }] },
    cookie,
  );
  const { receipt } = await res.json<{ receipt: Receipt }>();
  await env.DB.prepare('UPDATE sales SET created_at = ? WHERE id = ?')
    .bind(dayStartMs(day, TZ) + hour * 3_600_000, receipt.id)
    .run();
  return receipt;
}

async function income(cookie: string, from: string, to: string, group = 'day') {
  return getWithCookie(`/reports/income?from=${from}&to=${to}&group=${group}`, cookie);
}

async function report(cookie: string, from: string, to: string, group = 'day') {
  const res = await income(cookie, from, to, group);
  expect(res.status).toBe(200);
  return res.json<IncomeReport>();
}

describe('income report', () => {
  it('mixes stored days, live days and days the cron missed', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie, { priceCents: 1_000, costCents: 400, stock: 99 });
    const today = localDay(Date.now(), TZ);
    const d = (n: number) => addDays(today, -n);

    await sellOn(owner.cookie, p.id, 1, d(5)); // stored by the cron below
    await runNightly(env, dayStartMs(d(4), TZ) + 600_000); // writes d(5) and d(6)
    await sellOn(owner.cookie, p.id, 2, d(3)); // no summary row: computed live
    await sellOn(owner.cookie, p.id, 3, d(1)); // yesterday: live
    const v = await sellOn(owner.cookie, p.id, 1, today);
    await sellOn(owner.cookie, p.id, 4, today, 0);
    await postJson(`/sales/${v.id}/void`, { reason: 'Mistake' }, owner.cookie);

    const body = await report(owner.cookie, d(6), today);
    const byDay = Object.fromEntries(body.buckets.map((b) => [b.key, b]));
    expect(body.buckets).toHaveLength(7);
    expect(byDay[d(6)]).toMatchObject({ salesCount: 0, grossCents: 0 });
    expect(byDay[d(5)]).toMatchObject({ salesCount: 1, grossCents: 1_000, profitCents: 600 });
    expect(byDay[d(3)]).toMatchObject({ salesCount: 1, grossCents: 2_000 });
    expect(byDay[d(1)]).toMatchObject({ grossCents: 3_000, costCents: 1_200 });
    expect(byDay[today]).toMatchObject({
      salesCount: 1,
      grossCents: 4_000,
      voidedCents: 1_000,
      profitCents: 2_400,
    });
    expect(body.totals).toEqual({
      salesCount: 4,
      grossCents: 10_000,
      voidedCents: 1_000,
      costCents: 4_000,
      profitCents: 6_000,
    });
    expect(body.today).toBe(today);
  });

  it('groups by Monday weeks and by month, keeping empty periods', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie, { priceCents: 500, stock: 99 });
    // 2026-09-30 is a Wednesday; 2026-10-05 a Monday.
    await sellOn(owner.cookie, p.id, 1, '2026-09-30');
    await sellOn(owner.cookie, p.id, 2, '2026-10-01');
    await sellOn(owner.cookie, p.id, 3, '2026-10-12');

    const weeks = await report(owner.cookie, '2026-09-30', '2026-10-18', 'week');
    expect(weeks.buckets.map((b) => [b.key, b.from, b.to, b.grossCents])).toEqual([
      ['2026-09-28', '2026-09-30', '2026-10-04', 1_500],
      ['2026-10-05', '2026-10-05', '2026-10-11', 0],
      ['2026-10-12', '2026-10-12', '2026-10-18', 1_500],
    ]);

    const months = await report(owner.cookie, '2026-09-01', '2026-10-31', 'month');
    expect(months.buckets.map((b) => [b.key, b.grossCents])).toEqual([
      ['2026-09', 500],
      ['2026-10', 2_500],
    ]);
  });

  it('only shows this shop’s sales', async () => {
    const a = await signUp();
    const b = await signUp();
    const p = await createProductAs(a.cookie, { priceCents: 900, stock: 9 });
    await sellOn(a.cookie, p.id, 1, '2026-10-10');
    expect((await report(b.cookie, '2026-10-10', '2026-10-10')).totals.grossCents).toBe(0);
  });

  it('is for admins, and checks the range', async () => {
    const owner = await signUp();
    const staff = await addMember(owner, 'staff');
    const admin = await addMember(owner, 'admin');
    expect((await income(staff.cookie, '2026-10-01', '2026-10-02')).status).toBe(403);
    expect((await income(admin.cookie, '2026-10-01', '2026-10-02')).status).toBe(200);
    expect((await income(owner.cookie, '2026-10-02', '2026-10-01')).status).toBe(400);
    expect((await income(owner.cookie, '2025-01-01', '2026-10-01')).status).toBe(400);
    expect((await income(owner.cookie, '2026-10-01', '2026-10-02', 'year')).status).toBe(400);
    expect((await income(owner.cookie, 'yesterday', '2026-10-02')).status).toBe(400);
  });
});

describe('top products and sales by staff', () => {
  it('ranks best sellers by revenue or quantity, skipping voided sales', async () => {
    const owner = await signUp();
    const oil = await createProductAs(owner.cookie, {
      name: 'Oil',
      priceCents: 30_000,
      costCents: 20_000,
      stock: 99,
    });
    const bolt = await createProductAs(owner.cookie, { name: 'Bolt', priceCents: 500, stock: 99 });
    await sellOn(owner.cookie, oil.id, 2, '2026-10-10');
    await sellOn(owner.cookie, bolt.id, 10, '2026-10-11');
    const v = await sellOn(owner.cookie, bolt.id, 50, '2026-10-11');
    await postJson(`/sales/${v.id}/void`, { reason: 'Mistake' }, owner.cookie);
    await sellOn(owner.cookie, bolt.id, 5, '2026-10-20'); // outside the range

    const get = async (sort: string) =>
      (
        await (
          await getWithCookie(
            `/reports/top-products?from=2026-10-01&to=2026-10-15&sort=${sort}`,
            owner.cookie,
          )
        ).json<{ products: TopProduct[] }>()
      ).products;

    expect(await get('revenue')).toEqual([
      {
        productId: oil.id,
        name: 'Oil',
        quantity: 2,
        revenueCents: 60_000,
        profitCents: 20_000,
        imageUrl: null,
        thumbUrl: null,
      },
      {
        productId: bolt.id,
        name: 'Bolt',
        quantity: 10,
        revenueCents: 5_000,
        profitCents: 5_000,
        imageUrl: null,
        thumbUrl: null,
      },
    ]);
    expect((await get('quantity')).map((p) => p.name)).toEqual(['Bolt', 'Oil']);
  });

  it('totals each cashier, with their voids', async () => {
    const owner = await signUp();
    const staff = await addMember(owner, 'staff');
    const p = await createProductAs(owner.cookie, { priceCents: 1_000, stock: 99 });
    await sellOn(staff.cookie, p.id, 1, '2026-10-10');
    await sellOn(staff.cookie, p.id, 2, '2026-10-10');
    const v = await sellOn(staff.cookie, p.id, 1, '2026-10-10');
    await postJson(`/sales/${v.id}/void`, { reason: 'Mistake' }, owner.cookie);
    await sellOn(owner.cookie, p.id, 1, '2026-10-10');
    await postJson(`/staff/${staff.id}/deactivate`, {}, owner.cookie);

    const res = await getWithCookie(
      '/reports/by-staff?from=2026-10-10&to=2026-10-10',
      owner.cookie,
    );
    const { staff: rows } = await res.json<{ staff: StaffSales[] }>();
    expect(rows).toEqual([
      expect.objectContaining({
        userId: staff.id,
        active: false,
        salesCount: 2,
        grossCents: 3_000,
        voidedCount: 1,
        voidedCents: 1_000,
      }),
      expect.objectContaining({
        userId: owner.userId,
        active: true,
        salesCount: 1,
        grossCents: 1_000,
      }),
    ]);
  });

  it('checks limits', async () => {
    const owner = await signUp();
    const bad = await getWithCookie(
      '/reports/top-products?from=2026-10-01&to=2026-10-02&limit=500',
      owner.cookie,
    );
    expect(bad.status).toBe(400);
    const noRange = await getWithCookie('/reports/by-staff', owner.cookie);
    expect(noRange.status).toBe(400);
  });
});

describe('dashboard', () => {
  it('returns today and the last 7 days in one request', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie, { priceCents: 2_000, costCents: 500, stock: 3 });
    const today = localDay(Date.now(), TZ);
    await sellOn(owner.cookie, p.id, 2, today);
    await sellOn(owner.cookie, p.id, 1, addDays(today, -7)); // just outside 7 days

    const res = await getWithCookie('/reports/dashboard?days=7', owner.cookie);
    const body = await res.json<Dashboard>();
    expect(body.income.buckets).toHaveLength(7);
    expect(body.income.buckets.at(-1)).toMatchObject({ key: today, grossCents: 4_000 });
    expect(body.income.totals.grossCents).toBe(4_000);
    expect(body.topProducts).toEqual([expect.objectContaining({ productId: p.id, quantity: 2 })]);
    expect(body.staff).toEqual([expect.objectContaining({ userId: owner.userId, salesCount: 1 })]);
    expect(body.alerts).toEqual({ low: 0, out: 1 });

    expect((await getWithCookie('/reports/dashboard?days=30', owner.cookie)).status).toBe(200);
    expect((await getWithCookie('/reports/dashboard?days=90', owner.cookie)).status).toBe(400);
  });
});
