import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { hashRecoveryCode, normalizeRecoveryCode } from '../../src/worker/security/recovery-codes';
import { api, getWithCookie, postJson, sessionCookie, signUp } from './helpers';

const NEW_PASSWORD = 'bagong password ngayon';

let ipCounter = 0;
const freshIp = () => `198.51.100.${(ipCounter += 1)}`;

function recover(
  body: { shopSlug: string; username?: string; code: string; newPassword?: string },
  ip = freshIp(),
  turnstileToken: string | null = 'valid-token', // null = leave it out
) {
  return api('/auth/recover', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify({
      username: 'juan',
      newPassword: NEW_PASSWORD,
      ...(turnstileToken ? { turnstileToken } : {}),
      ...body,
    }),
  });
}

function login(shopSlug: string, password: string) {
  return postJson('/auth/login', { shopSlug, username: 'juan', password });
}

describe('recovery codes at signup', () => {
  it('returns 10 unique codes, once', async () => {
    const { recoveryCodes } = await signUp();
    expect(recoveryCodes).toHaveLength(10);
    expect(new Set(recoveryCodes).size).toBe(10);
    for (const code of recoveryCodes)
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/);
  });

  it('stores only keyed hashes of the codes', async () => {
    const { userId, recoveryCodes } = await signUp();
    const { results } = await env.DB.prepare(
      'SELECT code_hash, used_at FROM recovery_codes WHERE user_id = ?',
    )
      .bind(userId)
      .all<{ code_hash: string; used_at: number | null }>();
    expect(results).toHaveLength(10);

    const stored = new Set(results.map((r) => r.code_hash));
    for (const code of recoveryCodes) {
      expect(stored.has(await hashRecoveryCode(code, 'test-pepper'))).toBe(true);
      for (const hash of stored) {
        expect(hash).not.toContain(normalizeRecoveryCode(code));
      }
    }
    expect(results.every((r) => r.used_at === null)).toBe(true);
  });
});

describe('POST /auth/recover', () => {
  it('resets the password with a code and starts a new session', async () => {
    const { body, recoveryCodes } = await signUp();
    const res = await recover({ shopSlug: body.shopSlug, code: recoveryCodes[0] ?? '' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, remainingCodes: 9 });
    expect((await getWithCookie('/me', sessionCookie(res))).status).toBe(200);

    expect((await login(body.shopSlug, body.password)).status).toBe(401);
    expect((await login(body.shopSlug, NEW_PASSWORD)).status).toBe(200);
  });

  it('accepts codes typed loosely (lowercase, spaces, no dash)', async () => {
    const { body, recoveryCodes } = await signUp();
    const loose = ` ${(recoveryCodes[0] ?? '').toLowerCase().replace('-', ' ')} `;
    const res = await recover({ shopSlug: body.shopSlug, code: loose });
    expect(res.status).toBe(200);
  });

  it('each code works only once', async () => {
    const { body, recoveryCodes } = await signUp();
    const code = recoveryCodes[0] ?? '';
    expect((await recover({ shopSlug: body.shopSlug, code })).status).toBe(200);

    const again = await recover({
      shopSlug: body.shopSlug,
      code,
      newPassword: 'yet another password',
    });
    expect(again.status).toBe(401);
    expect(await again.json()).toMatchObject({ error: { code: 'INVALID_RECOVERY' } });

    const next = await recover({ shopSlug: body.shopSlug, code: recoveryCodes[1] ?? '' });
    expect(await next.json()).toEqual({ ok: true, remainingCodes: 8 });
  });

  it('revokes every existing session', async () => {
    const { body, cookie, recoveryCodes } = await signUp();
    const other = sessionCookie(await login(body.shopSlug, body.password));
    expect((await getWithCookie('/me', cookie)).status).toBe(200);

    expect((await recover({ shopSlug: body.shopSlug, code: recoveryCodes[0] ?? '' })).status).toBe(
      200,
    );
    expect((await getWithCookie('/me', cookie)).status).toBe(401);
    expect((await getWithCookie('/me', other)).status).toBe(401);
  });

  it('rejects a wrong code with a generic error and leaves the password alone', async () => {
    const { body } = await signUp();
    const res = await recover({ shopSlug: body.shopSlug, code: 'AAAAA-AAAAA' });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: {
        code: 'INVALID_RECOVERY',
        message: 'Shop code, username or recovery code is incorrect.',
      },
    });
    expect((await login(body.shopSlug, body.password)).status).toBe(200);
  });

  it('gives the same answer for an unknown shop or username', async () => {
    const { body, recoveryCodes } = await signUp();
    const code = recoveryCodes[0] ?? '';
    for (const res of [
      await recover({ shopSlug: 'no-such-shop', code }),
      await recover({ shopSlug: body.shopSlug, username: 'ghost', code }),
    ]) {
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ error: { code: 'INVALID_RECOVERY' } });
    }
  });

  it("does not accept one shop's code for another shop", async () => {
    const a = await signUp();
    const b = await signUp();
    const res = await recover({ shopSlug: b.body.shopSlug, code: a.recoveryCodes[0] ?? '' });
    expect(res.status).toBe(401);
  });

  it('only works for owners', async () => {
    const { body, userId, recoveryCodes } = await signUp();
    await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(userId).run();
    const res = await recover({ shopSlug: body.shopSlug, code: recoveryCodes[0] ?? '' });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: 'INVALID_RECOVERY' } });
  });

  it('does not work for a deactivated owner', async () => {
    const { body, userId, recoveryCodes } = await signUp();
    await env.DB.prepare('UPDATE users SET active = 0 WHERE id = ?').bind(userId).run();
    const res = await recover({ shopSlug: body.shopSlug, code: recoveryCodes[0] ?? '' });
    expect(res.status).toBe(401);
  });

  it('enforces the owner password policy', async () => {
    const { body, recoveryCodes } = await signUp();
    const code = recoveryCodes[0] ?? '';
    const res = await recover({ shopSlug: body.shopSlug, code, newPassword: 'short' });
    expect(res.status).toBe(400);
    // The code was not spent by the rejected request.
    expect((await recover({ shopSlug: body.shopSlug, code })).status).toBe(200);
  });

  it('always requires Turnstile', async () => {
    const { body, recoveryCodes } = await signUp();
    const code = recoveryCodes[0] ?? '';
    // Missing or failed → 403; Cloudflare unreachable → 503 (fails closed).
    for (const [token, status] of [
      [null, 403],
      ['bad-token', 403],
      ['unreachable', 503],
    ] as const) {
      const res = await recover({ shopSlug: body.shopSlug, code }, freshIp(), token);
      expect(res.status, String(token)).toBe(status);
      const { error } = await res.json<{ error: { code: string } }>();
      expect(error.code).toMatch(/^TURNSTILE_/);
    }
    // None of those spent the code.
    expect((await recover({ shopSlug: body.shopSlug, code })).status).toBe(200);
  });

  it('is rate limited after 5 wrong codes, even with a right one', async () => {
    const { body, recoveryCodes } = await signUp();
    const ip = freshIp();
    for (let i = 0; i < 5; i++) {
      expect((await recover({ shopSlug: body.shopSlug, code: `WRONG-0000${i}` }, ip)).status).toBe(
        401,
      );
    }
    const res = await recover({ shopSlug: body.shopSlug, code: recoveryCodes[0] ?? '' }, freshIp());
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: { code: 'TOO_MANY_ATTEMPTS' } });
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('keeps recovery failures apart from login failures', async () => {
    const { body } = await signUp();
    for (let i = 0; i < 5; i++) {
      await recover({ shopSlug: body.shopSlug, code: `WRONG-0000${i}` });
    }
    expect((await login(body.shopSlug, body.password)).status).toBe(200);
  });
});

describe('recovery edge cases', () => {
  it('spends a code only once when two requests race', async () => {
    const { body, recoveryCodes } = await signUp();
    const code = recoveryCodes[0] ?? '';
    const results = await Promise.all([
      recover({ shopSlug: body.shopSlug, code, newPassword: 'first racing password' }),
      recover({ shopSlug: body.shopSlug, code, newPassword: 'second racing password' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
  });

  it('lets a locked-out owner back in and clears the lock', async () => {
    const { body, userId, recoveryCodes } = await signUp();
    await env.DB.prepare('UPDATE users SET locked_until = ?, failed_logins = 7 WHERE id = ?')
      .bind(Date.now() + 10 * 60 * 1000, userId)
      .run();
    expect((await login(body.shopSlug, body.password)).status).toBe(429);

    expect((await recover({ shopSlug: body.shopSlug, code: recoveryCodes[0] ?? '' })).status).toBe(
      200,
    );
    const row = await env.DB.prepare('SELECT failed_logins, locked_until FROM users WHERE id = ?')
      .bind(userId)
      .first<{ failed_logins: number; locked_until: number | null }>();
    expect(row).toEqual({ failed_logins: 0, locked_until: null });
    expect((await login(body.shopSlug, NEW_PASSWORD)).status).toBe(200);
  });
});
