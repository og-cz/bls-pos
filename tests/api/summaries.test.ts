import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import type { Receipt } from '../../src/shared/schemas/sales';
import { runNightly } from '../../src/worker/cron';
import { createProductAs, postJson, signUp } from './helpers';

const key = () => crypto.randomUUID().replace(/-/g, '');

async function sellAt(cookie: string, productId: string, quantity: number, at: string) {
  const res = await postJson(
    '/sales',
    { idempotencyKey: key(), paymentMethod: 'cash', items: [{ productId, quantity }] },
    cookie,
  );
  const { receipt } = await res.json<{ receipt: Receipt }>();
  await env.DB.prepare('UPDATE sales SET created_at = ? WHERE id = ?')
    .bind(Date.parse(at), receipt.id)
    .run();
  return receipt;
}

function summary(shopId: string, day: string) {
  return env.DB.prepare(
    'SELECT sales_count, gross_cents, voided_cents, cost_cents FROM daily_summaries WHERE shop_id = ? AND day = ?',
  )
    .bind(shopId, day)
    .first<{
      sales_count: number;
      gross_cents: number;
      voided_cents: number;
      cost_cents: number;
    }>();
}

describe('daily summaries', () => {
  it('the nightly run totals sales, voids and cost by Manila day', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie, { priceCents: 1_000, costCents: 600, stock: 50 });
    // 2026-10-28 in Manila runs from 10-27 16:00 UTC to 10-28 16:00 UTC.
    await sellAt(owner.cookie, p.id, 2, '2026-10-27T16:00:00Z');
    await sellAt(owner.cookie, p.id, 1, '2026-10-28T15:59:59Z');
    const voided = await sellAt(owner.cookie, p.id, 3, '2026-10-28T10:00:00Z');
    await env.DB.prepare("UPDATE sales SET status = 'voided' WHERE id = ?").bind(voided.id).run();
    // Belongs to 10-29 in Manila even though it is still 10-28 in UTC.
    await sellAt(owner.cookie, p.id, 4, '2026-10-28T16:00:00Z');

    await runNightly(env, Date.parse('2026-10-29T16:10:00Z')); // 00:10 on 10-30 in Manila

    expect(await summary(owner.shopId, '2026-10-28')).toEqual({
      sales_count: 2,
      gross_cents: 3_000,
      voided_cents: 3_000,
      cost_cents: 1_800,
    });
    expect(await summary(owner.shopId, '2026-10-29')).toMatchObject({
      sales_count: 1,
      gross_cents: 4_000,
    });
  });

  it('running twice gives the same totals', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie, { priceCents: 500, stock: 10 });
    await sellAt(owner.cookie, p.id, 1, '2026-10-29T02:00:00Z');
    const now = Date.parse('2026-10-29T16:10:00Z');
    await runNightly(env, now);
    await runNightly(env, now);
    expect(await summary(owner.shopId, '2026-10-29')).toMatchObject({
      sales_count: 1,
      gross_cents: 500,
      cost_cents: 0,
    });
  });

  it('a shop in another timezone gets its own day boundaries', async () => {
    const owner = await signUp();
    await env.DB.prepare("UPDATE shops SET timezone = 'UTC' WHERE id = ?").bind(owner.shopId).run();
    const p = await createProductAs(owner.cookie, { priceCents: 100, stock: 10 });
    await sellAt(owner.cookie, p.id, 1, '2026-10-29T23:30:00Z');
    await runNightly(env, Date.parse('2026-10-30T00:10:00Z'));
    expect(await summary(owner.shopId, '2026-10-29')).toMatchObject({ gross_cents: 100 });
  });

  it('voiding an old sale updates that day at once', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie, { priceCents: 700, stock: 10 });
    const receipt = await sellAt(owner.cookie, p.id, 1, '2026-10-20T03:00:00Z');
    await runNightly(env, Date.parse('2026-10-21T16:10:00Z'));
    expect(await summary(owner.shopId, '2026-10-20')).toMatchObject({ gross_cents: 700 });

    const res = await postJson(`/sales/${receipt.id}/void`, { reason: 'Wrong item' }, owner.cookie);
    expect(res.status).toBe(200);
    expect(await summary(owner.shopId, '2026-10-20')).toMatchObject({
      sales_count: 0,
      gross_cents: 0,
      voided_cents: 700,
    });
  });
});
