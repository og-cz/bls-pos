import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import type { AuditEntry } from '../../src/shared/audit';
import { getDb } from '../../src/worker/db/client';
import { writeAudit } from '../../src/worker/services/audit';
import { addMember, api, getWithCookie, postJson, signUp } from './helpers';

type Page = { entries: AuditEntry[]; nextCursor: string | null };

async function auditOf(cookie: string, query = '') {
  const res = await getWithCookie(`/audit${query}`, cookie);
  expect(res.status).toBe(200);
  return res.json<Page>();
}

const actions = (page: Page) => page.entries.map((e) => e.action);

function loginFrom(ip: string, body: { shopSlug: string; username: string; password: string }) {
  return api('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify({ turnstileToken: 'valid-token', ...body }),
  });
}

describe('audit log entries', () => {
  it('records signup, staff changes and logins, newest first, with who did it', async () => {
    const owner = await signUp();
    const staff = await addMember(owner, 'staff', 'ana'); // staff.create + login.success
    await postJson(`/staff/${staff.id}/deactivate`, {}, owner.cookie);

    const page = await auditOf(owner.cookie);
    expect(actions(page)).toEqual([
      'staff.deactivate',
      'login.success',
      'staff.create',
      'shop.create',
    ]);
    const [deactivated, login, created] = page.entries;
    expect(deactivated).toMatchObject({
      user: { id: owner.userId, displayName: 'Juan Dela Cruz' },
      targetType: 'user',
      targetId: staff.id,
      details: { username: 'ana' },
    });
    expect(login?.user?.id).toBe(staff.id);
    expect(created?.details).toEqual({ username: 'ana', role: 'staff' });
  });

  it('records failed logins and the lock, with a hashed IP only', async () => {
    const { body, shopId, userId } = await signUp();
    await env.DB.prepare('UPDATE users SET failed_logins = 9 WHERE id = ?').bind(userId).run();
    const res = await loginFrom('203.0.113.200', {
      shopSlug: body.shopSlug,
      username: 'juan',
      password: 'not the password',
    });
    expect(res.status).toBe(401);

    const rows = await env.DB.prepare(
      "SELECT action, details_json, ip_hash FROM audit_log WHERE shop_id = ? AND action LIKE 'login.%' ORDER BY id",
    )
      .bind(shopId)
      .all<{ action: string; details_json: string | null; ip_hash: string | null }>();
    expect(rows.results.map((r) => r.action)).toEqual(['login.failed', 'login.locked']);
    const failed = rows.results.find((r) => r.action === 'login.failed');
    expect(JSON.parse(failed?.details_json ?? '{}')).toEqual({
      reason: 'wrong_password',
    });
    expect(failed?.ip_hash).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(rows.results)).not.toContain('203.0.113.200');
    expect(JSON.stringify(rows.results)).not.toContain('not the password');
  });

  it('records a password recovery, and a wrong code', async () => {
    const owner = await signUp();
    const codes = owner.recoveryCodes;
    const recover = (code: string) =>
      postJson('/auth/recover', {
        shopSlug: owner.body.shopSlug,
        username: 'juan',
        code,
        newPassword: 'a whole new password',
        turnstileToken: 'valid-token',
      });
    expect((await recover('WRONG-WRONG')).status).toBe(401);
    const ok = await recover(codes[0] ?? '');
    expect(ok.status).toBe(200);

    const cookie = ok.headers.getSetCookie()[0]?.split(';')[0] ?? '';
    const page = await auditOf(cookie);
    expect(actions(page).slice(0, 2)).toEqual(['password.recover', 'recover.failed']);
    expect(JSON.stringify(page)).not.toContain(codes[0]);
  });

  it('never stores secret-looking details, even if a caller passes them', async () => {
    const { shopId, cookie } = await signUp();
    await writeAudit(getDb(env.DB), shopId, {
      action: 'staff.create',
      details: { username: 'ok', password: 'x', temporaryPassword: 'y', tokenHash: 'z', code: 'c' },
    });
    const [entry] = (await auditOf(cookie)).entries;
    expect(entry?.details).toEqual({ username: 'ok' });
  });
});

describe('GET /audit', () => {
  it('pages with a cursor', async () => {
    const owner = await signUp();
    for (let i = 0; i < 4; i++) await addMember(owner, 'staff', `crew${i}`); // 8 entries + signup

    const first = await auditOf(owner.cookie, '?limit=5');
    expect(first.entries).toHaveLength(5);
    expect(first.nextCursor).toBe(first.entries.at(-1)?.id);

    const second = await auditOf(owner.cookie, `?limit=5&cursor=${first.nextCursor ?? ''}`);
    expect(second.entries).toHaveLength(4);
    expect(second.nextCursor).toBeNull();
    const ids = [...first.entries, ...second.entries].map((e) => e.id);
    expect(new Set(ids).size).toBe(9);
    expect([...ids].sort().reverse()).toEqual(ids);
  });

  it('rejects bad paging values', async () => {
    const { cookie } = await signUp();
    for (const q of ['?limit=0', '?limit=101', '?limit=abc', '?shopId=x']) {
      expect((await getWithCookie(`/audit${q}`, cookie)).status, q).toBe(400);
    }
  });

  it("shows only this shop's entries", async () => {
    const a = await signUp();
    const b = await signUp();
    await addMember(b, 'staff');
    const page = await auditOf(a.cookie);
    expect(actions(page)).toEqual(['shop.create']);
  });

  it('is hidden from staff', async () => {
    const owner = await signUp();
    const staff = await addMember(owner, 'staff');
    expect((await getWithCookie('/audit', staff.cookie)).status).toBe(403);
    const admin = await addMember(owner, 'admin');
    expect((await getWithCookie('/audit', admin.cookie)).status).toBe(200);
  });
});
