import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { addMember, getWithCookie, postJson, signUp } from './helpers';

const deactivate = (id: string, cookie: string) => postJson(`/staff/${id}/deactivate`, {}, cookie);

describe('POST /staff/:id/deactivate', () => {
  it('deactivates staff, ends their sessions at once and blocks new logins', async () => {
    const owner = await signUp();
    const staff = await addMember(owner, 'staff');
    expect((await getWithCookie('/me', staff.cookie)).status).toBe(200);

    const res = await deactivate(staff.id, owner.cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ user: { id: staff.id, active: false } });

    expect((await getWithCookie('/me', staff.cookie)).status).toBe(401);
    const open = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND revoked_at IS NULL',
    )
      .bind(staff.id)
      .first<{ n: number }>();
    expect(open?.n).toBe(0);

    const login = await postJson('/auth/login', {
      shopSlug: owner.body.shopSlug,
      username: staff.username,
      password: staff.temporaryPassword,
    });
    expect(login.status).toBe(401);
  });

  it('is safe to repeat', async () => {
    const owner = await signUp();
    const staff = await addMember(owner, 'staff');
    expect((await deactivate(staff.id, owner.cookie)).status).toBe(200);
    expect((await deactivate(staff.id, owner.cookie)).status).toBe(200);
  });

  it('lets admins deactivate staff, but not other admins or the owner', async () => {
    const owner = await signUp();
    const admin = await addMember(owner, 'admin');
    const admin2 = await addMember(owner, 'admin');
    const staff = await addMember(owner, 'staff');

    expect((await deactivate(staff.id, admin.cookie)).status).toBe(200);
    expect((await deactivate(admin2.id, admin.cookie)).status).toBe(403);
    expect((await deactivate(owner.userId, admin.cookie)).status).toBe(403);
    expect((await getWithCookie('/me', owner.cookie)).status).toBe(200);
  });

  it('lets the owner deactivate admins, but not themselves', async () => {
    const owner = await signUp();
    const admin = await addMember(owner, 'admin');
    expect((await deactivate(admin.id, owner.cookie)).status).toBe(200);
    expect((await getWithCookie('/me', admin.cookie)).status).toBe(401);

    const self = await deactivate(owner.userId, owner.cookie);
    expect(self.status).toBe(403);
    expect((await getWithCookie('/me', owner.cookie)).status).toBe(200);
  });

  it('blocks staff from deactivating anyone', async () => {
    const owner = await signUp();
    const a = await addMember(owner, 'staff');
    const b = await addMember(owner, 'staff');
    expect((await deactivate(b.id, a.cookie)).status).toBe(403);
    expect((await getWithCookie('/me', b.cookie)).status).toBe(200);
  });

  it("can't reach another shop's accounts, which look like they don't exist", async () => {
    const a = await signUp();
    const b = await signUp();
    const bStaff = await addMember(b, 'staff');

    const res = await deactivate(bStaff.id, a.cookie);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect((await deactivate(crypto.randomUUID(), a.cookie)).status).toBe(404);
    expect((await getWithCookie('/me', bStaff.cookie)).status).toBe(200);
  });
});
