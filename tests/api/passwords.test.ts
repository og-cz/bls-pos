import { describe, expect, it } from 'vitest';

import { addMember, api, getWithCookie, postJson, signUp } from './helpers';

const login = (slug: string, username: string, password: string) =>
  postJson('/auth/login', { shopSlug: slug, username, password, turnstileToken: 'valid-token' });

const cookieOf = (res: Response) => (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

describe('changing your own password', () => {
  it('needs the current one, follows the policy, and logs out other devices', async () => {
    const owner = await signUp();
    const other = cookieOf(await login(owner.body.shopSlug, 'juan', owner.body.password));

    const wrong = await postJson(
      '/me/password',
      { currentPassword: 'not it', newPassword: 'another long password' },
      owner.cookie,
    );
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toMatchObject({
      error: { fields: { currentPassword: expect.any(String) as string } },
    });

    const weak = await postJson(
      '/me/password',
      { currentPassword: owner.body.password, newPassword: 'short' },
      owner.cookie,
    );
    expect(await weak.json()).toMatchObject({
      error: { fields: { newPassword: expect.any(String) as string } },
    });

    const ok = await postJson(
      '/me/password',
      { currentPassword: owner.body.password, newPassword: 'a brand new long password' },
      owner.cookie,
    );
    expect(ok.status).toBe(200);
    expect((await getWithCookie('/me', other)).status).toBe(401);
    expect((await getWithCookie('/me', owner.cookie)).status).toBe(200);
    expect((await login(owner.body.shopSlug, 'juan', owner.body.password)).status).toBe(401);
    expect((await login(owner.body.shopSlug, 'juan', 'a brand new long password')).status).toBe(
      200,
    );
  });
});

describe('admin resets a staff password', () => {
  it('gives a new temporary password, unlocks, and signs the person out', async () => {
    const owner = await signUp();
    const staff = await addMember(owner, 'staff');
    const res = await postJson(`/staff/${staff.id}/reset-password`, {}, owner.cookie);
    expect(res.status).toBe(200);
    const { temporaryPassword } = await res.json<{ temporaryPassword: string }>();
    expect((await getWithCookie('/me', staff.cookie)).status).toBe(401);
    expect((await login(owner.body.shopSlug, staff.username, temporaryPassword)).status).toBe(200);
  });

  it('nobody resets the owner, themselves, or (as admin) another admin', async () => {
    const owner = await signUp();
    const admin = await addMember(owner, 'admin');
    const admin2 = await addMember(owner, 'admin');
    const staff = await addMember(owner, 'staff');
    expect((await postJson(`/staff/${owner.userId}/reset-password`, {}, admin.cookie)).status).toBe(
      403,
    );
    expect((await postJson(`/staff/${admin.id}/reset-password`, {}, admin.cookie)).status).toBe(
      403,
    );
    expect((await postJson(`/staff/${admin2.id}/reset-password`, {}, admin.cookie)).status).toBe(
      403,
    );
    expect((await postJson(`/staff/${owner.userId}/reset-password`, {}, staff.cookie)).status).toBe(
      403,
    );
    // Another shop's account looks like no account.
    const other = await signUp();
    expect((await postJson(`/staff/${staff.id}/reset-password`, {}, other.cookie)).status).toBe(
      404,
    );
  });
});

describe('changing roles', () => {
  it('only the owner makes admins; the change signs the person out', async () => {
    const owner = await signUp();
    const admin = await addMember(owner, 'admin');
    const staff = await addMember(owner, 'staff');

    expect(
      (await postJson(`/staff/${staff.id}/role`, { role: 'admin' }, admin.cookie)).status,
    ).toBe(403);
    expect(
      (await postJson(`/staff/${staff.id}/role`, { role: 'owner' }, owner.cookie)).status,
    ).toBe(400);
    expect(
      (await postJson(`/staff/${staff.id}/role`, { role: 'admin' }, owner.cookie)).status,
    ).toBe(200);
    expect((await getWithCookie('/me', staff.cookie)).status).toBe(401);

    const fresh = cookieOf(
      await api('/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          shopSlug: owner.body.shopSlug,
          username: staff.username,
          password: staff.temporaryPassword,
          turnstileToken: 'valid-token',
        }),
      }),
    );
    const me = await (await getWithCookie('/me', fresh)).json<{ user: { role: string } }>();
    expect(me.user.role).toBe('admin');
  });
});
