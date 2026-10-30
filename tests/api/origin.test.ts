import { describe, expect, it } from 'vitest';

import { api, ORIGIN, signUp, signupBody } from './helpers';

const json = (body: unknown, headers: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

describe('cross-site requests', () => {
  it('a form or script on another site cannot change anything', async () => {
    const owner = await signUp();
    const attack = await api(
      '/products',
      json(
        { name: 'Planted', priceCents: 1 },
        { cookie: owner.cookie, origin: 'https://evil.example' },
      ),
    );
    expect(attack.status).toBe(403);
    expect(await attack.json()).toMatchObject({ error: { code: 'CROSS_ORIGIN' } });

    const noOrigin = await api(
      '/auth/logout',
      json({}, { cookie: owner.cookie, 'sec-fetch-site': 'cross-site' }),
    );
    expect(noOrigin.status).toBe(403);
  });

  it('the app itself still works', async () => {
    const owner = await signUp();
    const res = await api(
      '/products',
      json(
        { name: 'Real', priceCents: 100 },
        { cookie: owner.cookie, origin: ORIGIN, 'sec-fetch-site': 'same-origin' },
      ),
    );
    expect(res.status).toBe(201);
    const signup = await api(
      '/auth/signup',
      json(signupBody(), { origin: ORIGIN, 'sec-fetch-site': 'same-origin' }),
    );
    expect(signup.status).toBe(201);
  });

  it('reading is not affected', async () => {
    expect((await api('/health', { headers: { origin: 'https://other.example' } })).status).toBe(
      200,
    );
  });
});
