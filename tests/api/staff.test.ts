import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { addMember, getWithCookie, postJson, signUp } from './helpers';

type Created = {
  user: { id: string; username: string; displayName: string; role: string; active: boolean };
  temporaryPassword: string;
};
type Members = { members: { username: string; role: string }[] };

describe('POST /staff', () => {
  it('creates a staff account with a temporary password', async () => {
    const owner = await signUp();
    const res = await postJson(
      '/staff',
      { username: 'Cashier.Ana', displayName: 'Ana Reyes' },
      owner.cookie,
    );
    expect(res.status).toBe(201);
    const json = await res.json<Created>();
    expect(json.user).toMatchObject({
      username: 'cashier.ana',
      displayName: 'Ana Reyes',
      role: 'staff',
      active: true,
    });
    expect(json.temporaryPassword).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    expect(JSON.stringify(json)).not.toMatch(/hash/i);

    const login = await postJson('/auth/login', {
      shopSlug: owner.body.shopSlug,
      username: 'cashier.ana',
      password: json.temporaryPassword,
    });
    expect(login.status).toBe(200);
    expect(await login.json()).toMatchObject({ role: 'staff' });

    const row = await env.DB.prepare('SELECT shop_id, password_hash FROM users WHERE id = ?')
      .bind(json.user.id)
      .first<{ shop_id: string; password_hash: string }>();
    expect(row?.shop_id).toBe(owner.shopId);
    expect(row?.password_hash).not.toContain(json.temporaryPassword);
  });

  it('lets admins add staff but only the owner add admins', async () => {
    const owner = await signUp();
    const admin = await addMember(owner, 'admin');

    const staff = await postJson(
      '/staff',
      { username: 'by-admin', displayName: 'X' },
      admin.cookie,
    );
    expect(staff.status).toBe(201);

    const another = await postJson(
      '/staff',
      { username: 'new-admin', displayName: 'X', role: 'admin' },
      admin.cookie,
    );
    expect(another.status).toBe(403);
    expect(await another.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('never creates an owner or accepts a password, shop or status from the client', async () => {
    const owner = await signUp();
    const other = await signUp();
    for (const extra of [
      { role: 'owner' },
      { password: 'chosen by client' },
      { shopId: other.shopId },
      { active: false },
    ]) {
      const res = await postJson(
        '/staff',
        { username: 'sneaky', displayName: 'X', ...extra },
        owner.cookie,
      );
      expect(res.status, JSON.stringify(extra)).toBe(400);
    }
  });

  it('blocks staff from adding anyone', async () => {
    const owner = await signUp();
    const staff = await addMember(owner, 'staff');
    const res = await postJson('/staff', { username: 'friend', displayName: 'X' }, staff.cookie);
    expect(res.status).toBe(403);
  });

  it('rejects a username already used in the shop', async () => {
    const owner = await signUp();
    const res = await postJson(
      '/staff',
      { username: 'juan', displayName: 'Other Juan' },
      owner.cookie,
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      error: { code: 'USERNAME_TAKEN', fields: { username: 'Already taken in this shop.' } },
    });
  });

  it('allows the same username in another shop', async () => {
    const a = await signUp();
    const b = await signUp();
    await addMember(a, 'staff', 'cashier');
    await addMember(b, 'staff', 'cashier');
  });

  it('enforces the Free limit of 5, not counting the owner or deactivated accounts', async () => {
    const owner = await signUp();
    const add = (username: string) =>
      postJson('/staff', { username, displayName: 'Crew' }, owner.cookie);
    for (let i = 0; i < 5; i++) expect((await add(`crew${i}`)).status).toBe(201);

    const sixth = await add('crew5');
    expect(sixth.status).toBe(409);
    expect(await sixth.json()).toMatchObject({ error: { code: 'STAFF_LIMIT_REACHED' } });

    await env.DB.prepare('UPDATE users SET active = 0 WHERE shop_id = ? AND username = ?')
      .bind(owner.shopId, 'crew0')
      .run();
    expect((await add('crew5')).status).toBe(201);
  });
});

describe('GET /staff', () => {
  it('lists the shop members, owner first, without password data', async () => {
    const owner = await signUp();
    await addMember(owner, 'staff', 'zed');
    await addMember(owner, 'admin', 'amy');
    const res = await getWithCookie('/staff', owner.cookie);
    expect(res.status).toBe(200);
    const { members } = await res.json<Members>();
    expect(members.map((m) => [m.username, m.role])).toEqual([
      ['juan', 'owner'],
      ['amy', 'admin'],
      ['zed', 'staff'],
    ]);
    expect(JSON.stringify(members)).not.toMatch(/password|hash|totp/i);
  });

  it('never shows members of another shop', async () => {
    const a = await signUp();
    const b = await signUp();
    await addMember(b, 'staff', 'only-in-b');
    const { members } = await (await getWithCookie('/staff', a.cookie)).json<Members>();
    expect(members.map((m) => m.username)).toEqual(['juan']);
  });

  it('is for admins and the owner only', async () => {
    const owner = await signUp();
    const staff = await addMember(owner, 'staff');
    expect((await getWithCookie('/staff', staff.cookie)).status).toBe(403);
  });
});
