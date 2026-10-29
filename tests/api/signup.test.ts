import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { postJson, signupBody } from './helpers';

type ErrorJson = { error: { code: string; fields?: Record<string, string> } };

describe('POST /auth/signup', () => {
  it('creates a shop and its owner', async () => {
    const body = signupBody();
    const res = await postJson('/auth/signup', body);
    expect(res.status).toBe(201);

    const json = await res.json<{ shop: { id: string; slug: string }; user: { id: string } }>();
    expect(json).toMatchObject({
      shop: { slug: body.shopSlug, name: 'Kape ni Juan' },
      user: { username: 'juan', displayName: 'Juan Dela Cruz', role: 'owner' },
    });

    const shop = await env.DB.prepare('SELECT * FROM shops WHERE id = ?')
      .bind(json.shop.id)
      .first();
    expect(shop).toMatchObject({ plan: 'free', business_type: 'cafe', onboarding_step: 0 });
    expect(JSON.parse(String(shop?.theme_json))).toMatchObject({
      brand: '#8B5E3C',
      presetId: 'cafe-mocha',
    });

    const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
      .bind(json.user.id)
      .first();
    expect(user).toMatchObject({ shop_id: json.shop.id, role: 'owner', active: 1 });
  });

  it('never stores the password itself', async () => {
    const body = signupBody();
    const res = await postJson('/auth/signup', body);
    const { user } = await res.json<{ user: { id: string } }>();
    const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?')
      .bind(user.id)
      .first<{ password_hash: string }>();
    expect(row?.password_hash).toMatch(/^pbkdf2\$sha256\$100000\$/);
    expect(row?.password_hash).not.toContain(body.password);
  });

  it('normalizes shop code and username to lowercase', async () => {
    const body = signupBody({ username: 'JuanDC' });
    const res = await postJson('/auth/signup', { ...body, shopSlug: body.shopSlug.toUpperCase() });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      shop: { slug: body.shopSlug },
      user: { username: 'juandc' },
    });
  });

  it('rejects a shop code that is already taken', async () => {
    const body = signupBody();
    expect((await postJson('/auth/signup', body)).status).toBe(201);

    const res = await postJson('/auth/signup', { ...body, username: 'someone' });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'SLUG_TAKEN' } });
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE username = ?')
      .bind('someone')
      .first<{ n: number }>();
    expect(count?.n).toBe(0);
  });

  it('rejects extra fields such as a smuggled role or plan', async () => {
    for (const extra of [{ role: 'admin' }, { plan: 'business' }, { shopId: 'x' }]) {
      const res = await postJson('/auth/signup', signupBody(extra));
      expect(res.status).toBe(400);
      expect(await res.json<ErrorJson>()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    }
  });

  it('explains which fields are wrong', async () => {
    const res = await postJson('/auth/signup', signupBody({ password: 'short', shopSlug: 'api' }));
    expect(res.status).toBe(400);
    const { error } = await res.json<ErrorJson>();
    expect(Object.keys(error.fields ?? {}).sort()).toEqual(['password', 'shopSlug']);
  });

  it('rejects weak passwords, reserved codes and bad usernames', async () => {
    const bad = [
      { password: 'Password123' },
      { password: 'nine char' },
      { shopSlug: 'admin' },
      { shopSlug: 'a' },
      { shopSlug: '-shop' },
      { shopSlug: 'my--shop' },
      { username: 'ju' },
      { username: 'juan dela cruz' },
      { businessType: 'casino' },
      { shopName: '' },
      { shopName: 'x'.repeat(81) },
      { ownerName: 'Juan\u0000' },
    ];
    for (const override of bad) {
      const res = await postJson('/auth/signup', signupBody(override));
      expect(res.status, JSON.stringify(override)).toBe(400);
    }
  });

  it('rejects malformed and oversized bodies', async () => {
    const malformed = await postJson('/auth/signup', '{not json');
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({ error: { code: 'INVALID_JSON' } });

    const huge = await postJson('/auth/signup', signupBody({ shopName: 'x'.repeat(70_000) }));
    expect(huge.status).toBe(413);
  });
});
