import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import type { DailyCloseView, DailyClosing } from '../../src/shared/schemas/reports';
import type { Receipt } from '../../src/shared/schemas/sales';
import { addDays, dayStartMs, localDay } from '../../src/shared/time';
import { addMember, createProductAs, getWithCookie, postJson, signUp } from './helpers';

const TZ = 'Asia/Manila';
const key = () => crypto.randomUUID().replace(/-/g, '');

function sellNow(cookie: string, productId: string, extra: Record<string, unknown> = {}) {
  return postJson(
    '/sales',
    {
      idempotencyKey: key(),
      paymentMethod: 'cash',
      items: [{ productId, quantity: 1 }],
      ...extra,
    },
    cookie,
  );
}

async function sellOn(cookie: string, productId: string, day: string, extra = {}) {
  const { receipt } = await (await sellNow(cookie, productId, extra)).json<{ receipt: Receipt }>();
  await env.DB.prepare('UPDATE sales SET created_at = ? WHERE id = ?')
    .bind(dayStartMs(day, TZ) + 3_600_000, receipt.id)
    .run();
  return receipt;
}

const close = (cookie: string, day: string) => postJson('/reports/daily-close', { day }, cookie);

describe('daily close (Z-reading)', () => {
  it('records totals, voids, payment breakdown and the sale number range', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie, { priceCents: 1_000, stock: 50 });
    const day = '2026-10-20';
    const first = await sellOn(owner.cookie, p.id, day);
    const v = await sellOn(owner.cookie, p.id, day);
    await sellOn(owner.cookie, p.id, day, {
      paymentMethod: 'other_manual',
      paymentReference: 'GCash 1234',
    });
    await postJson(`/sales/${v.id}/void`, { reason: 'Mistake' }, owner.cookie);
    await sellOn(owner.cookie, p.id, '2026-10-21'); // the next day

    const preview = await (
      await getWithCookie(`/reports/daily-close?day=${day}`, owner.cookie)
    ).json<DailyCloseView>();
    expect(preview.closing).toBeNull();

    const res = await close(owner.cookie, day);
    expect(res.status).toBe(201);
    const { closing } = await res.json<{ closing: DailyClosing }>();
    const expected = {
      day,
      firstSaleNumber: first.number,
      lastSaleNumber: first.number + 2,
      salesCount: 2,
      grossCents: 2_000,
      voidedCount: 1,
      voidedCents: 1_000,
      payments: { cash: { count: 1, cents: 1_000 }, other_manual: { count: 1, cents: 1_000 } },
    };
    expect(closing).toMatchObject({ ...expected, closedBy: { id: owner.userId } });
    expect(preview.preview).toEqual(expected);

    const view = await (
      await getWithCookie(`/reports/daily-close?day=${day}`, owner.cookie)
    ).json<DailyCloseView>();
    expect(view.preview).toBeNull();
    expect(view.closing).toEqual(closing);
  });

  it('a closed day is locked: no voids, no second close, no edits', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie, { priceCents: 500, stock: 50 });
    const day = '2026-10-15';
    const sale = await sellOn(owner.cookie, p.id, day);
    expect((await close(owner.cookie, day)).status).toBe(201);

    const voided = await postJson(`/sales/${sale.id}/void`, { reason: 'Late' }, owner.cookie);
    expect(voided.status).toBe(409);
    expect(await voided.json()).toMatchObject({ error: { code: 'DAY_CLOSED' } });
    expect((await close(owner.cookie, day)).status).toBe(409);

    // Even straight SQL cannot change the closing or the day's sales.
    await expect(
      env.DB.prepare('UPDATE daily_closings SET gross_cents = 0 WHERE shop_id = ?')
        .bind(owner.shopId)
        .run(),
    ).rejects.toThrow(/DAY_CLOSED/);
    await expect(
      env.DB.prepare('DELETE FROM daily_closings WHERE shop_id = ?').bind(owner.shopId).run(),
    ).rejects.toThrow(/DAY_CLOSED/);
    await expect(
      env.DB.prepare("UPDATE sales SET status = 'voided' WHERE id = ?").bind(sale.id).run(),
    ).rejects.toThrow(/DAY_CLOSED/);
  });

  it('after closing today, new sales are refused and nothing changes', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie, { priceCents: 500, stock: 5 });
    const today = localDay(Date.now(), TZ);
    expect((await sellNow(owner.cookie, p.id)).status).toBe(201);
    expect((await close(owner.cookie, today)).status).toBe(201);

    const res = await sellNow(owner.cookie, p.id);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'DAY_CLOSED' } });
    const stock = await env.DB.prepare('SELECT stock FROM products WHERE id = ?')
      .bind(p.id)
      .first<{ stock: number }>();
    expect(stock?.stock).toBe(4);
  });

  it('only admins close, never a future day, and each shop closes its own day', async () => {
    const a = await signUp();
    const b = await signUp();
    const staff = await addMember(a, 'staff');
    const today = localDay(Date.now(), TZ);
    expect((await close(staff.cookie, today)).status).toBe(403);
    expect((await close(a.cookie, addDays(today, 1))).status).toBe(400);
    expect((await close(a.cookie, today)).status).toBe(201);
    expect((await close(b.cookie, today)).status).toBe(201);
    const log = await env.DB.prepare(
      "SELECT count(*) AS n FROM audit_log WHERE shop_id = ? AND action = 'day.close'",
    )
      .bind(a.shopId)
      .first<{ n: number }>();
    expect(log?.n).toBe(1);
  });
});
