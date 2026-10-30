import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import {
  classify,
  syncQueue,
  type QueueItem,
  type QueueStore,
  type SendResult,
} from '../../src/shared/offline-sync';
import type { IncomeReport } from '../../src/shared/schemas/reports';
import { localDay } from '../../src/shared/time';
import { createProductAs, getWithCookie, postJson, signUp } from './helpers';

/** The device's queue, in memory. */
function memoryStore(items: QueueItem[]): QueueStore<QueueItem> & { items: QueueItem[] } {
  const store = {
    items: [...items],
    all: () => Promise.resolve([...store.items]),
    put: (item: QueueItem) => {
      store.items = store.items.map((i) => (i.key === item.key ? item : i));
      return Promise.resolve();
    },
    remove: (key: string) => {
      store.items = store.items.filter((i) => i.key !== key);
      return Promise.resolve();
    },
  };
  return store;
}

/** Sends through the real API, the way the browser does. */
function sender(cookie: string) {
  return async (body: Record<string, unknown>): Promise<SendResult> => {
    const res = await postJson('/sales', body, cookie);
    if (res.ok) return { ok: true };
    const json = await res.json<{ error: { message: string } }>();
    return { ok: false, status: res.status, message: json.error.message };
  };
}

let n = 0;
function offlineSale(productId: string, quantity: number, createdAt: number): QueueItem {
  n += 1;
  const key = `offline${String(n)}${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  return {
    key,
    createdAt,
    status: 'pending',
    error: null,
    body: {
      idempotencyKey: key,
      paymentMethod: 'cash',
      clientCreatedAt: createdAt,
      items: [{ productId, quantity }],
    },
  };
}

async function salesCount(shopId: string) {
  const row = await env.DB.prepare('SELECT count(*) AS n FROM sales WHERE shop_id = ?')
    .bind(shopId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

describe('offline sales', () => {
  it('classifies server answers', () => {
    expect(classify({ ok: true })).toBe('sent');
    expect(classify({ ok: false, status: 0, message: '' })).toBe('retry-later');
    expect(classify({ ok: false, status: 503, message: '' })).toBe('retry-later');
    expect(classify({ ok: false, status: 429, message: '' })).toBe('retry-later');
    expect(classify({ ok: false, status: 401, message: '' })).toBe('signed-out');
    expect(classify({ ok: false, status: 409, message: '' })).toBe('review');
    expect(classify({ ok: false, status: 400, message: '' })).toBe('review');
  });

  it('sync sends oldest first; the sales show in the dashboard with their device time', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie, { priceCents: 1_000, stock: 10 });
    const t = Date.now();
    const store = memoryStore([
      offlineSale(p.id, 2, t - 1_000),
      offlineSale(p.id, 1, t - 5_000), // older: goes first, gets sale #1
    ]);
    const summary = await syncQueue(store, sender(owner.cookie));
    expect(summary).toEqual({ sent: 2, review: 0, left: 0, stopped: null });
    expect(store.items).toEqual([]);

    const rows = await env.DB.prepare(
      'SELECT number, client_created_at FROM sales WHERE shop_id = ? ORDER BY number',
    )
      .bind(owner.shopId)
      .all<{ number: number; client_created_at: number }>();
    expect(rows.results.map((r) => r.client_created_at)).toEqual([t - 5_000, t - 1_000]);

    const today = localDay(Date.now(), 'Asia/Manila');
    const income = await (
      await getWithCookie(`/reports/income?from=${today}&to=${today}`, owner.cookie)
    ).json<IncomeReport>();
    expect(income.totals).toMatchObject({ salesCount: 2, grossCents: 3_000 });
  });

  it('a sale whose answer was lost is never recorded twice', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie, { priceCents: 500, stock: 10 });
    const sale = offlineSale(p.id, 1, Date.now());
    // It reached the server, but the phone never heard back, so it is still queued.
    await sender(owner.cookie)(sale.body);
    const store = memoryStore([sale]);
    await syncQueue(store, sender(owner.cookie));
    await syncQueue(store, sender(owner.cookie));
    expect(store.items).toEqual([]);
    expect(await salesCount(owner.shopId)).toBe(1);
  });

  it('a sale the server refuses goes to Needs review; the rest still send', async () => {
    const owner = await signUp();
    const scarce = await createProductAs(owner.cookie, { priceCents: 100, stock: 1 });
    const plenty = await createProductAs(owner.cookie, { priceCents: 100, stock: 50 });
    const t = Date.now();
    const store = memoryStore([
      offlineSale(scarce.id, 1, t - 3_000),
      offlineSale(scarce.id, 1, t - 2_000), // another till sold the last one meanwhile
      offlineSale(plenty.id, 3, t - 1_000),
    ]);
    const summary = await syncQueue(store, sender(owner.cookie));
    expect(summary).toMatchObject({ sent: 2, review: 1, left: 0 });
    expect(store.items).toHaveLength(1);
    expect(store.items[0]).toMatchObject({ status: 'review' });
    expect(store.items[0]?.error).toMatch(/stock/i);

    // Review items are left alone by later syncs until someone retries them.
    await syncQueue(store, sender(owner.cookie));
    expect(store.items).toHaveLength(1);
    expect(await salesCount(owner.shopId)).toBe(2);
  });

  it('stops at the first "no connection" and keeps the order', async () => {
    const t = Date.now();
    const store = memoryStore([offlineSale('a', 1, t - 2_000), offlineSale('b', 1, t - 1_000)]);
    const tried: unknown[] = [];
    const summary = await syncQueue(store, (body) => {
      tried.push(body.items);
      return Promise.resolve({ ok: false, status: 0, message: 'No connection.' });
    });
    expect(summary).toEqual({ sent: 0, review: 0, left: 2, stopped: 'retry-later' });
    expect(tried).toHaveLength(1);
    expect(store.items.every((i) => i.status === 'pending')).toBe(true);
  });

  it('a signed-out device keeps its sales for after login', async () => {
    const owner = await signUp();
    const p = await createProductAs(owner.cookie, { stock: 5 });
    const store = memoryStore([offlineSale(p.id, 1, Date.now())]);
    const summary = await syncQueue(store, sender('bls_session=expired'));
    expect(summary.stopped).toBe('signed-out');
    expect(store.items).toHaveLength(1);
    expect(await salesCount(owner.shopId)).toBe(0);
  });
});
