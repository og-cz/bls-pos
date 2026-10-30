import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import {
  base32Decode,
  base32Encode,
  decryptSecret,
  encryptSecret,
  TOTP_STEP_SECONDS,
  totpAt,
  verifyTotp,
} from '../../src/worker/security/totp';
import { addMember, getWithCookie, postJson, signUp } from './helpers';

const codeNow = (secret: string) =>
  totpAt(secret, Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS));

const login = (owner: Awaited<ReturnType<typeof signUp>>, extra: Record<string, unknown> = {}) =>
  postJson('/auth/login', {
    shopSlug: owner.body.shopSlug,
    username: owner.body.username,
    password: owner.body.password,
    turnstileToken: 'valid-token',
    ...extra,
  });

async function turnOn(cookie: string) {
  const { secret, uri } = await (
    await postJson('/me/2fa/setup', {}, cookie)
  ).json<{
    secret: string;
    uri: string;
  }>();
  const res = await postJson('/me/2fa/enable', { secret, code: await codeNow(secret) }, cookie);
  return { secret, uri, res };
}

describe('TOTP', () => {
  it('matches the RFC 6238 test vectors (SHA-1, last 6 digits)', async () => {
    const secret = base32Encode(new TextEncoder().encode('12345678901234567890'));
    expect(secret).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(await totpAt(secret, Math.floor(59 / 30))).toBe('287082');
    expect(await totpAt(secret, Math.floor(1111111109 / 30))).toBe('081804');
    expect(await totpAt(secret, Math.floor(2000000000 / 30))).toBe('279037');
    expect(new TextDecoder().decode(base32Decode(secret))).toBe('12345678901234567890');
  });

  it('accepts one step of clock drift, not more', async () => {
    const secret = base32Encode(new TextEncoder().encode('12345678901234567890'));
    const t = 1111111109_000;
    expect(await verifyTotp(secret, '081804', t)).toBe(true);
    expect(await verifyTotp(secret, '081804', t + 30_000)).toBe(true);
    expect(await verifyTotp(secret, '081804', t + 90_000)).toBe(false);
    expect(await verifyTotp(secret, '12345', t)).toBe(false);
  });

  it('encrypts the stored secret with a fresh IV each time', async () => {
    const key = env.TOTP_ENC_KEY;
    const a = await encryptSecret('JBSWY3DPEHPK3PXP', key);
    const b = await encryptSecret('JBSWY3DPEHPK3PXP', key);
    expect(a).not.toBe(b);
    expect(a).not.toContain('JBSWY3DPEHPK3PXP');
    expect(await decryptSecret(a, key)).toBe('JBSWY3DPEHPK3PXP');
  });
});

describe('two-step login', () => {
  it('once on, login needs the code from the app', async () => {
    const owner = await signUp();
    const { uri, res } = await turnOn(owner.cookie);
    expect(res.status).toBe(200);
    expect(uri).toMatch(/^otpauth:\/\/totp\/bls%20POS%3Ajuan%40/);

    const noCode = await login(owner);
    expect(noCode.status).toBe(401);
    expect(await noCode.json()).toMatchObject({ error: { code: 'TOTP_REQUIRED' } });
    expect(noCode.headers.get('set-cookie')).toBeNull();

    const wrong = await login(owner, { totpCode: '000000' });
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toMatchObject({ error: { code: 'INVALID_TOTP' } });

    const row = await env.DB.prepare('SELECT totp_secret_enc FROM users WHERE id = ?')
      .bind(owner.userId)
      .first<{ totp_secret_enc: string }>();
    const secret = await decryptSecret(row?.totp_secret_enc ?? '', env.TOTP_ENC_KEY);
    const ok = await login(owner, { totpCode: await codeNow(secret) });
    expect(ok.status).toBe(200);
  });

  it('a wrong password never reveals whether two-step login is on', async () => {
    const owner = await signUp();
    await turnOn(owner.cookie);
    const res = await login(owner, { password: 'definitely not it' });
    expect(await res.json()).toMatchObject({ error: { code: 'INVALID_CREDENTIALS' } });
  });

  it('turning it on logs out other devices; off needs a current code', async () => {
    const owner = await signUp();
    const other = await login(owner);
    const otherCookie = (other.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    const { secret } = await turnOn(owner.cookie);
    expect((await getWithCookie('/me', otherCookie)).status).toBe(401);
    expect((await getWithCookie('/me', owner.cookie)).status).toBe(200);

    expect((await postJson('/me/2fa/disable', { code: '000000' }, owner.cookie)).status).toBe(400);
    const off = await postJson('/me/2fa/disable', { code: await codeNow(secret) }, owner.cookie);
    expect(off.status).toBe(200);
    expect((await login(owner)).status).toBe(200);
  });

  it('is for owners and admins; a wrong setup code changes nothing', async () => {
    const owner = await signUp();
    const staff = await addMember(owner, 'staff');
    expect((await postJson('/me/2fa/setup', {}, staff.cookie)).status).toBe(403);
    const { secret } = await (
      await postJson('/me/2fa/setup', {}, owner.cookie)
    ).json<{
      secret: string;
    }>();
    expect(
      (await postJson('/me/2fa/enable', { secret, code: '000000' }, owner.cookie)).status,
    ).toBe(400);
    expect(await (await getWithCookie('/me/2fa', owner.cookie)).json()).toEqual({
      available: true,
      enabled: false,
    });
  });
});
