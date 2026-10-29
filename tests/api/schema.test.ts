import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

const now = Date.now();

async function insertShop(id: string, slug: string, businessType = 'cafe') {
  await env.DB.prepare(
    `INSERT INTO shops (id, slug, name, business_type, theme_json, created_at)
     VALUES (?, ?, 'Test', ?, '{}', ?)`,
  )
    .bind(id, slug, businessType, now)
    .run();
}

describe('database schema', () => {
  it('applies defaults on a new shop', async () => {
    await insertShop('s1', 'shop-one');
    const shop = await env.DB.prepare('SELECT * FROM shops WHERE id = ?').bind('s1').first();
    expect(shop).toMatchObject({
      currency: 'PHP',
      timezone: 'Asia/Manila',
      plan: 'free',
      storefront_enabled: 0,
      onboarding_step: 0,
    });
  });

  it('rejects duplicate shop slugs', async () => {
    await insertShop('s2', 'same-slug');
    await expect(insertShop('s3', 'same-slug')).rejects.toThrow(/UNIQUE/);
  });

  it('rejects unknown business types and roles', async () => {
    await expect(insertShop('s4', 'bad-type', 'casino')).rejects.toThrow(/CHECK/);

    await insertShop('s5', 'role-shop');
    await expect(
      env.DB.prepare(
        `INSERT INTO users (id, shop_id, username, display_name, role, password_hash, created_at)
         VALUES ('u1', 's5', 'x', 'X', 'superuser', 'h', ?)`,
      )
        .bind(now)
        .run(),
    ).rejects.toThrow(/CHECK/);
  });

  it('allows the same username in different shops but not in one shop', async () => {
    await insertShop('a', 'shop-a');
    await insertShop('b', 'shop-b');
    const add = (id: string, shop: string) =>
      env.DB.prepare(
        `INSERT INTO users (id, shop_id, username, display_name, role, password_hash, created_at)
         VALUES (?, ?, 'maria', 'Maria', 'staff', 'h', ?)`,
      )
        .bind(id, shop, now)
        .run();

    await add('u-a', 'a');
    await add('u-b', 'b');
    await expect(add('u-a2', 'a')).rejects.toThrow(/UNIQUE/);
  });
});
