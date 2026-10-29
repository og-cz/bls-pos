import { describe, expect, it, vi } from 'vitest';

import { api, postJson, signUp, signupBody } from './helpers';

function login(body: Record<string, unknown>, ip = '198.51.100.7') {
  return api('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify(body),
  });
}

describe('Turnstile on signup', () => {
  it('is always required', async () => {
    const noToken: Record<string, unknown> = signupBody();
    delete noToken.turnstileToken;
    const res = await postJson('/auth/signup', noToken);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: 'TURNSTILE_REQUIRED' } });
  });

  it('rejects a token Cloudflare does not accept', async () => {
    const res = await postJson('/auth/signup', signupBody({ turnstileToken: 'forged' }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: 'TURNSTILE_FAILED' } });
  });

  it('fails closed when Cloudflare cannot be reached', async () => {
    const res = await postJson('/auth/signup', signupBody({ turnstileToken: 'unreachable' }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: { code: 'TURNSTILE_UNAVAILABLE' } });
  });

  it('sends the secret, token and visitor IP to siteverify', async () => {
    await api('/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.44' },
      body: JSON.stringify(signupBody()),
    });
    const call = vi
      .mocked(fetch)
      .mock.calls.find(([url]) =>
        (url instanceof Request ? url.url : url.toString()).includes('siteverify'),
      );
    const form = call?.[1]?.body as FormData;
    expect(form.get('secret')).toBe('test-turnstile-secret');
    expect(form.get('response')).toBe('valid-token');
    expect(form.get('remoteip')).toBe('192.0.2.44');
  });

  it('rejects oversized tokens before calling Cloudflare', async () => {
    const res = await postJson('/auth/signup', signupBody({ turnstileToken: 'x'.repeat(2049) }));
    expect(res.status).toBe(400);
  });
});

describe('Turnstile on login', () => {
  it('is not needed for a normal login', async () => {
    const { body } = await signUp();
    const res = await login({ shopSlug: body.shopSlug, username: 'juan', password: body.password });
    expect(res.status).toBe(200);
  });

  it('is required after 3 failed logins for an account', async () => {
    const { body } = await signUp();
    const ip = '198.51.100.20';
    for (let i = 0; i < 3; i++) {
      const res = await login({ shopSlug: body.shopSlug, username: 'juan', password: 'nope' }, ip);
      expect(res.status).toBe(401);
    }

    const noToken = await login(
      { shopSlug: body.shopSlug, username: 'juan', password: body.password },
      ip,
    );
    expect(noToken.status).toBe(403);
    expect(await noToken.json()).toMatchObject({ error: { code: 'TURNSTILE_REQUIRED' } });

    const badToken = await login(
      { shopSlug: body.shopSlug, username: 'juan', password: body.password, turnstileToken: 'x' },
      ip,
    );
    expect(badToken.status).toBe(403);

    const withToken = await login(
      {
        shopSlug: body.shopSlug,
        username: 'juan',
        password: body.password,
        turnstileToken: 'valid-token',
      },
      ip,
    );
    expect(withToken.status).toBe(200);
  });

  it('checks the human before the password, so bots learn nothing', async () => {
    const { body } = await signUp();
    const ip = '198.51.100.30';
    for (let i = 0; i < 3; i++) {
      await login({ shopSlug: body.shopSlug, username: 'juan', password: 'nope' }, ip);
    }
    // Wrong password without a token: the answer is "do the check", not "wrong password".
    const res = await login({ shopSlug: body.shopSlug, username: 'juan', password: 'nope' }, ip);
    expect(res.status).toBe(403);
  });
});
