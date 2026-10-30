import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import type { StaffMember } from '../../src/shared/schemas/staff';
import { addMember, api, getWithCookie, signUp } from './helpers';

// A 1×1 PNG.
const png = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  ),
  (ch) => ch.charCodeAt(0),
);

const patchMe = (cookie: string, body: unknown) =>
  api('/me', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });

const me = async (cookie: string) =>
  (
    await (
      await getWithCookie('/me', cookie)
    ).json<{
      user: { displayName: string; avatarUrl: string | null };
    }>()
  ).user;

describe('profiles', () => {
  it('anyone changes their own name and photo, shown to the shop', async () => {
    const owner = await signUp();
    const staff = await addMember(owner, 'staff');
    expect((await patchMe(staff.cookie, { displayName: 'Ana the Cashier' })).status).toBe(200);
    const up = await api('/uploads/avatar', {
      method: 'POST',
      headers: { 'content-type': 'image/png', cookie: staff.cookie },
      body: png,
    });
    expect(up.status).toBe(201);

    const mine = await me(staff.cookie);
    expect(mine.displayName).toBe('Ana the Cashier');
    expect(mine.avatarUrl).toMatch(/\/avatar\//);

    const { members } = await (
      await getWithCookie('/staff', owner.cookie)
    ).json<{ members: StaffMember[] }>();
    expect(members.find((m) => m.id === staff.id)).toMatchObject({
      displayName: 'Ana the Cashier',
      avatarUrl: mine.avatarUrl,
    });

    const del = await api('/me/avatar', { method: 'DELETE', headers: { cookie: staff.cookie } });
    expect(del.status).toBe(200);
    expect((await me(staff.cookie)).avatarUrl).toBeNull();
    const key = (mine.avatarUrl ?? '').replace('/api/v1/media/', '');
    expect(await env.MEDIA.head(key)).toBeNull();
  });

  it('only the name can change, as plain text', async () => {
    const owner = await signUp();
    expect((await patchMe(owner.cookie, { displayName: '' })).status).toBe(400);
    expect((await patchMe(owner.cookie, { displayName: 'x'.repeat(61) })).status).toBe(400);
    expect((await patchMe(owner.cookie, { displayName: 'A\u0000B' })).status).toBe(400);
    expect((await patchMe(owner.cookie, { displayName: 'Boss', role: 'owner' })).status).toBe(400);
    expect((await patchMe(owner.cookie, { username: 'other' })).status).toBe(400);
  });

  it("never changes someone else's profile", async () => {
    const owner = await signUp();
    const admin = await addMember(owner, 'admin');
    await patchMe(admin.cookie, { displayName: 'Changed' });
    expect((await me(owner.cookie)).displayName).not.toBe('Changed');
  });
});
