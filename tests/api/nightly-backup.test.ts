import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { addDays, localDay } from '../../src/shared/time';
import { BACKUP_HOUR_SQL, BACKUP_KEEP_DAYS, backupKey, runBackups } from '../../src/worker/backup';
import { addMember, api, createProductAs, postJson, signUp } from './helpers';

async function hourOf(shopId: string) {
  const row = await env.DB.prepare(`SELECT ${BACKUP_HOUR_SQL} AS h FROM shops WHERE id = ?`)
    .bind(shopId)
    .first<{ h: number }>();
  return row?.h ?? -1;
}

/** A moment today (UTC) at the given hour. */
function atHour(hour: number) {
  const d = new Date();
  d.setUTCHours(hour, 25, 0, 0);
  return d.getTime();
}

describe('nightly backups', () => {
  it("saves the shop's data to a private R2 path, without secrets", async () => {
    const owner = await signUp();
    await addMember(owner, 'staff');
    const p = await createProductAs(owner.cookie, {
      name: 'Brake Pad',
      priceCents: 65_000,
      costCents: 42_000,
      stock: 5,
    });
    await postJson(
      '/sales',
      {
        idempotencyKey: crypto.randomUUID().replace(/-/g, ''),
        paymentMethod: 'cash',
        items: [{ productId: p.id, quantity: 2 }],
      },
      owner.cookie,
    );

    const now = atHour(await hourOf(owner.shopId));
    expect(await runBackups(env, now)).toBeGreaterThanOrEqual(1);

    const day = localDay(now, 'Asia/Manila');
    const obj = await env.MEDIA.get(backupKey(owner.shopId, day));
    expect(obj?.httpMetadata?.contentType).toBe('application/json');
    const text = (await obj?.text()) ?? '';
    const doc = JSON.parse(text) as {
      shop: { slug: string };
      products: { name: string; costCents: number; stock: number }[];
      staff: unknown[];
      sales: { lines: { quantity: number }[] }[];
    };
    expect(doc.shop.slug).toBe(owner.body.shopSlug);
    expect(doc.products).toEqual([
      expect.objectContaining({ name: 'Brake Pad', costCents: 42_000, stock: 3 }),
    ]);
    expect(doc.staff).toHaveLength(2);
    expect(doc.sales[0]?.lines[0]?.quantity).toBe(2);
    expect(text).not.toMatch(/password|pbkdf2|totp|token/i);

    // Never reachable through the media route, even by the shop itself.
    const res = await api(`/media/${backupKey(owner.shopId, day)}`, {
      headers: { cookie: owner.cookie },
    });
    expect(res.status).toBe(404);
  });

  it(`keeps ${String(BACKUP_KEEP_DAYS)} days`, async () => {
    const owner = await signUp();
    const now = atHour(await hourOf(owner.shopId));
    const day = localDay(now, 'Asia/Manila');
    const old = backupKey(owner.shopId, addDays(day, -BACKUP_KEEP_DAYS));
    const recent = backupKey(owner.shopId, addDays(day, -3));
    await env.MEDIA.put(old, '{}');
    await env.MEDIA.put(recent, '{}');
    await runBackups(env, now);
    expect(await env.MEDIA.head(old)).toBeNull();
    expect(await env.MEDIA.head(recent)).not.toBeNull();
  });

  it('each run only takes its own hour of shops', async () => {
    const owner = await signUp();
    const hour = await hourOf(owner.shopId);
    const other = (hour + 1) % 24;
    const now = atHour(other);
    await runBackups(env, now);
    expect(await env.MEDIA.head(backupKey(owner.shopId, localDay(now, 'Asia/Manila')))).toBeNull();
    expect(hour).toBeGreaterThanOrEqual(0);
    expect(hour).toBeLessThan(24);
  });
});
