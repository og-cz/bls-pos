import { describe, expect, it } from 'vitest';

import { deviceLabel } from '../../src/shared/device';
import { addMember, api, getWithCookie, postJson, signUp } from './helpers';

type Session = { id: string; device: string; current: boolean };

async function loginAgain(owner: Awaited<ReturnType<typeof signUp>>, userAgent: string) {
  const res = await api('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': userAgent },
    body: JSON.stringify({
      shopSlug: owner.body.shopSlug,
      username: owner.body.username,
      password: owner.body.password,
      turnstileToken: 'valid-token',
    }),
  });
  return (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
}

const list = async (cookie: string) =>
  (await (await getWithCookie('/me/sessions', cookie)).json<{ sessions: Session[] }>()).sessions;

describe('active sessions', () => {
  it('lists your devices, and you can log one out', async () => {
    const owner = await signUp();
    const phone = await loginAgain(
      owner,
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36',
    );
    const sessions = await list(owner.cookie);
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((s) => s.current)).toHaveLength(1);
    const other = sessions.find((s) => !s.current);
    expect(other?.device).toBe('Chrome on Android');

    await api(`/me/sessions/${other?.id ?? ''}`, {
      method: 'DELETE',
      headers: { cookie: owner.cookie },
    });
    expect((await getWithCookie('/me', phone)).status).toBe(401);
    expect(await list(owner.cookie)).toHaveLength(1);
  });

  it('log out other devices keeps this one', async () => {
    const owner = await signUp();
    const a = await loginAgain(owner, 'A');
    const b = await loginAgain(owner, 'B');
    expect((await postJson('/me/sessions/revoke-others', {}, owner.cookie)).status).toBe(200);
    expect((await getWithCookie('/me', a)).status).toBe(401);
    expect((await getWithCookie('/me', b)).status).toBe(401);
    expect((await getWithCookie('/me', owner.cookie)).status).toBe(200);
  });

  it("you can never see or end someone else's session", async () => {
    const owner = await signUp();
    const staff = await addMember(owner, 'staff');
    const theirs = (await list(staff.cookie))[0];
    expect((await list(owner.cookie)).some((s) => s.id === theirs?.id)).toBe(false);
    await api(`/me/sessions/${theirs?.id ?? ''}`, {
      method: 'DELETE',
      headers: { cookie: owner.cookie },
    });
    expect((await getWithCookie('/me', staff.cookie)).status).toBe(200);
  });

  it('names common devices', () => {
    expect(
      deviceLabel(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('Safari on iPhone');
    expect(
      deviceLabel(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0',
      ),
    ).toBe('Edge on Windows');
    expect(deviceLabel(null)).toBe('Unknown device');
  });
});
