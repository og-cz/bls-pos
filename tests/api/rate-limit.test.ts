import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { api, signUp } from './helpers';

// Every request gets a client IP, as it would behind Cloudflare.
function login(body: { shopSlug: string; username: string; password: string }, ip: string) {
  return api('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify(body),
  });
}

let ipCounter = 0;
const freshIp = () => `203.0.113.${(ipCounter += 1)}`;

async function fail(shopSlug: string, username: string, ip: string, times: number) {
  for (let i = 0; i < times; i++) {
    const res = await login({ shopSlug, username, password: `wrong password ${i}` }, ip);
    expect(res.status).toBe(401);
  }
}

describe('login rate limiting', () => {
  it('blocks an account after 5 failures in 15 minutes, even with the right password', async () => {
    const { body } = await signUp();
    const ip = freshIp();
    await fail(body.shopSlug, 'juan', ip, 5);

    const res = await login(
      { shopSlug: body.shopSlug, username: 'juan', password: body.password },
      ip,
    );
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: { code: 'TOO_MANY_ATTEMPTS' } });
    const retryAfter = Number(res.headers.get('retry-after'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(15 * 60);
  });

  it('counts per account across different IPs', async () => {
    const { body } = await signUp();
    for (let i = 0; i < 5; i++) await fail(body.shopSlug, 'juan', freshIp(), 1);
    const res = await login(
      { shopSlug: body.shopSlug, username: 'juan', password: body.password },
      freshIp(),
    );
    expect(res.status).toBe(429);
  });

  it('limits guesses at usernames that do not exist (no account enumeration)', async () => {
    const { body } = await signUp();
    const ip = freshIp();
    await fail(body.shopSlug, 'ghost', ip, 5);
    const res = await login({ shopSlug: body.shopSlug, username: 'ghost', password: 'x' }, ip);
    expect(res.status).toBe(429);
  });

  it('does not block other accounts on the same shop Wi-Fi', async () => {
    const { body } = await signUp();
    const ip = freshIp();
    await fail(body.shopSlug, 'someone-else', ip, 5);
    const res = await login(
      { shopSlug: body.shopSlug, username: 'juan', password: body.password },
      ip,
    );
    expect(res.status).toBe(200);
  });

  it('blocks an IP after 20 failures across many accounts', async () => {
    const { body } = await signUp();
    const ip = freshIp();
    for (let i = 0; i < 20; i++) await fail(body.shopSlug, `user${i}`, ip, 1);

    const blocked = await login(
      { shopSlug: body.shopSlug, username: 'juan', password: body.password },
      ip,
    );
    expect(blocked.status).toBe(429);
    const elsewhere = await login(
      { shopSlug: body.shopSlug, username: 'juan', password: body.password },
      freshIp(),
    );
    expect(elsewhere.status).toBe(200);
  });

  it('a successful login resets the account counter', async () => {
    const { body } = await signUp();
    const ip = freshIp();
    await fail(body.shopSlug, 'juan', ip, 4);
    const ok = await login(
      { shopSlug: body.shopSlug, username: 'juan', password: body.password },
      ip,
    );
    expect(ok.status).toBe(200);
    await fail(body.shopSlug, 'juan', ip, 4); // would have been the 5th–8th failure
    const again = await login(
      { shopSlug: body.shopSlug, username: 'juan', password: body.password },
      ip,
    );
    expect(again.status).toBe(200);
  });
});

describe('account lockout', () => {
  it('locks for 15 minutes after 10 failures', async () => {
    const { body, userId } = await signUp();
    // 9 earlier failures (e.g. from previous windows), then one more.
    await env.DB.prepare('UPDATE users SET failed_logins = 9 WHERE id = ?').bind(userId).run();
    await fail(body.shopSlug, 'juan', freshIp(), 1);

    const row = await env.DB.prepare('SELECT failed_logins, locked_until FROM users WHERE id = ?')
      .bind(userId)
      .first<{ failed_logins: number; locked_until: number }>();
    expect(row?.failed_logins).toBe(0);
    expect(row?.locked_until).toBeGreaterThan(Date.now() + 14 * 60 * 1000);
    expect(row?.locked_until).toBeLessThanOrEqual(Date.now() + 15 * 60 * 1000);

    const res = await login(
      { shopSlug: body.shopSlug, username: 'juan', password: body.password },
      freshIp(),
    );
    expect(res.status).toBe(429);
    // Same answer as plain rate limiting: a lock does not reveal the account exists.
    expect(await res.json()).toEqual({
      error: {
        code: 'TOO_MANY_ATTEMPTS',
        message: 'Too many login attempts. Please wait and try again.',
      },
    });
  });

  it('unlocks after the lock expires and resets the counter', async () => {
    const { body, userId } = await signUp();
    await env.DB.prepare('UPDATE users SET locked_until = ?, failed_logins = 3 WHERE id = ?')
      .bind(Date.now() - 1000, userId)
      .run();
    const res = await login(
      { shopSlug: body.shopSlug, username: 'juan', password: body.password },
      freshIp(),
    );
    expect(res.status).toBe(200);
    const row = await env.DB.prepare('SELECT failed_logins, locked_until FROM users WHERE id = ?')
      .bind(userId)
      .first<{ failed_logins: number; locked_until: number | null }>();
    expect(row).toEqual({ failed_logins: 0, locked_until: null });
  });

  it('does not count wrong logins against a different shop with the same username', async () => {
    const a = await signUp();
    const b = await signUp();
    await fail(b.body.shopSlug, 'juan', freshIp(), 3);
    const row = await env.DB.prepare('SELECT failed_logins FROM users WHERE id = ?')
      .bind(a.userId)
      .first<{ failed_logins: number }>();
    expect(row?.failed_logins).toBe(0);
  });
});
