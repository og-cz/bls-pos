import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { addMember, getWithCookie, postJson, signUp } from './helpers';

const recover = (slug: string, code: string) =>
  postJson('/auth/recover', {
    shopSlug: slug,
    username: 'juan',
    code,
    newPassword: 'a brand new long password',
    turnstileToken: 'valid-token',
  });

describe('new recovery codes', () => {
  it('the owner gets 10 new codes; the old ones stop working', async () => {
    const owner = await signUp();
    const left = await getWithCookie('/me/recovery-codes', owner.cookie);
    expect(await left.json()).toEqual({ remaining: 10 });

    const res = await postJson('/me/recovery-codes', {}, owner.cookie);
    expect(res.status).toBe(201);
    const { codes } = await res.json<{ codes: string[] }>();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);

    const oldCode = owner.recoveryCodes[0] ?? '';
    expect((await recover(owner.body.shopSlug, oldCode)).status).toBe(401);
    expect((await recover(owner.body.shopSlug, codes[0] ?? '')).status).toBe(200);

    const log = await env.DB.prepare(
      "SELECT count(*) AS n FROM audit_log WHERE shop_id = ? AND action = 'recovery.regenerate'",
    )
      .bind(owner.shopId)
      .first<{ n: number }>();
    expect(log?.n).toBe(1);
  });

  it('admins and staff have no recovery codes', async () => {
    const owner = await signUp();
    const admin = await addMember(owner, 'admin');
    expect((await postJson('/me/recovery-codes', {}, admin.cookie)).status).toBe(403);
    expect((await getWithCookie('/me/recovery-codes', admin.cookie)).status).toBe(403);
  });
});
