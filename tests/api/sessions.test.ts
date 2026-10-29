import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { hashPassword } from '../../src/worker/security/password';
import { sha256Hex } from '../../src/worker/security/tokens';
import { STAFF_IDLE_MS } from '../../src/worker/services/sessions';
import { api, getWithCookie, postJson, sessionCookie, signUp } from './helpers';

const DAY = 24 * 60 * 60 * 1000;

function loginBody(shopSlug: string, username: string, password: string) {
  return { shopSlug, username, password };
}

async function addUser(shopId: string, username: string, role: string, password: string) {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO users (id, shop_id, username, display_name, role, password_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      shopId,
      username,
      username,
      role,
      await hashPassword(password, 'test-pepper'),
      Date.now(),
    )
    .run();
  return id;
}

describe('session cookie', () => {
  it('is set on signup with the required security attributes', async () => {
    const res = await postJson('/auth/signup', {
      shopName: 'Cookie Shop',
      shopSlug: `cookie-${crypto.randomUUID().slice(0, 8)}`,
      businessType: 'retail',
      ownerName: 'Owner',
      username: 'owner',
      password: 'a long enough password',
      turnstileToken: 'valid-token',
    });
    const header = res.headers.getSetCookie().find((c) => c.startsWith('__Host-bp_session='));
    expect(header).toBeDefined();
    expect(header).toMatch(/; HttpOnly/i);
    expect(header).toMatch(/; Secure/i);
    expect(header).toMatch(/; SameSite=Lax/i);
    expect(header).toMatch(/; Path=\//i);
    expect(header).not.toMatch(/Domain=/i);
  });

  it('stores only a hash of the token', async () => {
    const { cookie, userId } = await signUp();
    const token = cookie.split('=')[1] ?? '';
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 random bytes

    const row = await env.DB.prepare('SELECT token_hash FROM sessions WHERE user_id = ?')
      .bind(userId)
      .first<{ token_hash: string }>();
    expect(row?.token_hash).toBe(await sha256Hex(token));
    expect(row?.token_hash).not.toBe(token);
  });
});

describe('POST /auth/login', () => {
  it('logs in and gives access to /me', async () => {
    const { body } = await signUp();
    const res = await postJson('/auth/login', loginBody(body.shopSlug, 'juan', body.password));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, role: 'owner' });

    const me = await getWithCookie('/me', sessionCookie(res));
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({
      user: { username: 'juan', role: 'owner', displayName: 'Juan Dela Cruz' },
      shop: { slug: body.shopSlug, plan: 'free', theme: { presetId: 'cafe-mocha' } },
    });
  });

  it('accepts shop code and username in any letter case', async () => {
    const { body } = await signUp();
    const res = await postJson(
      '/auth/login',
      loginBody(body.shopSlug.toUpperCase(), 'JUAN', body.password),
    );
    expect(res.status).toBe(200);
  });

  it('gives the same answer for every kind of wrong login', async () => {
    const { body, shopId } = await signUp();
    await addUser(shopId, 'gone', 'staff', 'staff password');
    await env.DB.prepare('UPDATE users SET active = 0 WHERE username = ? AND shop_id = ?')
      .bind('gone', shopId)
      .run();

    const attempts = [
      loginBody(body.shopSlug, 'juan', 'wrong password!!'),
      loginBody(body.shopSlug, 'nobody', body.password),
      loginBody('no-such-shop', 'juan', body.password),
      loginBody(body.shopSlug, 'gone', 'staff password'), // deactivated
    ];
    for (const attempt of attempts) {
      const res = await postJson('/auth/login', attempt);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Shop code, username or password is incorrect.',
        },
      });
      expect(res.headers.getSetCookie()).toEqual([]);
    }
  });

  it("cannot log in to another shop with this shop's credentials", async () => {
    const a = await signUp();
    const b = await signUp({ password: 'shop b has its own password' });
    const res = await postJson('/auth/login', loginBody(b.body.shopSlug, 'juan', a.body.password));
    expect(res.status).toBe(401);
  });

  it('upgrades old password hashes on login', async () => {
    const { body, userId } = await signUp();
    await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .bind(await hashPassword(body.password, 'test-pepper', 50_000), userId)
      .run();

    expect(
      (await postJson('/auth/login', loginBody(body.shopSlug, 'juan', body.password))).status,
    ).toBe(200);
    const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?')
      .bind(userId)
      .first<{ password_hash: string }>();
    expect(row?.password_hash).toMatch(/^pbkdf2\$sha256\$100000\$/);
  });
});

describe('protected routes', () => {
  it('reject requests without a valid session', async () => {
    expect((await api('/me')).status).toBe(401);
    const forged = await getWithCookie('/me', '__Host-bp_session=forged-token-value');
    expect(forged.status).toBe(401);
    expect(await forged.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });

  it('ignore a plain cookie name without the __Host- prefix', async () => {
    const { cookie } = await signUp();
    const token = cookie.split('=')[1] ?? '';
    expect((await getWithCookie('/me', `bp_session=${token}`)).status).toBe(401);
  });
});

describe('POST /auth/logout', () => {
  it('revokes the session so the cookie stops working', async () => {
    const { cookie } = await signUp();
    expect((await getWithCookie('/me', cookie)).status).toBe(200);

    const res = await postJson('/auth/logout', {}, cookie);
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().join()).toMatch(/__Host-bp_session=;/);

    expect((await getWithCookie('/me', cookie)).status).toBe(401);
  });

  it('only logs out this device', async () => {
    const { body, cookie: first } = await signUp();
    const second = sessionCookie(
      await postJson('/auth/login', loginBody(body.shopSlug, 'juan', body.password)),
    );
    await postJson('/auth/logout', {}, first);
    expect((await getWithCookie('/me', second)).status).toBe(200);
  });

  it('requires a session', async () => {
    expect((await postJson('/auth/logout', {})).status).toBe(401);
  });
});

describe('session expiry', () => {
  async function age(cookie: string, fields: { expiresAt?: number; lastSeenAt?: number }) {
    const hash = await sha256Hex(cookie.split('=')[1] ?? '');
    if (fields.expiresAt !== undefined) {
      await env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?')
        .bind(fields.expiresAt, hash)
        .run();
    }
    if (fields.lastSeenAt !== undefined) {
      await env.DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?')
        .bind(fields.lastSeenAt, hash)
        .run();
    }
  }

  it('ends sessions after the 30-day absolute limit', async () => {
    const { cookie } = await signUp();
    await age(cookie, { expiresAt: Date.now() - 1 });
    expect((await getWithCookie('/me', cookie)).status).toBe(401);
  });

  it('ends idle staff sessions after 12 hours but keeps owner sessions', async () => {
    const owner = await signUp();
    await addUser(owner.shopId, 'cashier', 'staff', 'cashier password');
    const staffCookie = sessionCookie(
      await postJson('/auth/login', loginBody(owner.body.shopSlug, 'cashier', 'cashier password')),
    );

    const idle = Date.now() - STAFF_IDLE_MS - 1000;
    await age(staffCookie, { lastSeenAt: idle });
    await age(owner.cookie, { lastSeenAt: Date.now() - 2 * DAY });

    expect((await getWithCookie('/me', staffCookie)).status).toBe(401);
    expect((await getWithCookie('/me', owner.cookie)).status).toBe(200);
  });

  it('refreshes last_seen_at at most every 5 minutes', async () => {
    const { cookie } = await signUp();
    const hash = await sha256Hex(cookie.split('=')[1] ?? '');
    const lastSeen = async () =>
      (
        await env.DB.prepare('SELECT last_seen_at FROM sessions WHERE token_hash = ?')
          .bind(hash)
          .first<{ last_seen_at: number }>()
      )?.last_seen_at;

    const before = await lastSeen();
    await getWithCookie('/me', cookie);
    expect(await lastSeen()).toBe(before); // too soon to write

    await age(cookie, { lastSeenAt: Date.now() - 6 * 60 * 1000 });
    await getWithCookie('/me', cookie);
    expect(await lastSeen()).toBeGreaterThan(Date.now() - 60 * 1000);
  });

  it('ends sessions of deactivated users immediately', async () => {
    const owner = await signUp();
    const staffId = await addUser(owner.shopId, 'temp', 'staff', 'temp password!');
    const cookie = sessionCookie(
      await postJson('/auth/login', loginBody(owner.body.shopSlug, 'temp', 'temp password!')),
    );
    await env.DB.prepare('UPDATE users SET active = 0 WHERE id = ?').bind(staffId).run();
    expect((await getWithCookie('/me', cookie)).status).toBe(401);
  });
});
