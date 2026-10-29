import { Hono } from 'hono';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { hasRole, ROLES, type Role } from '../../src/shared/roles';
import type { AppEnv } from '../../src/worker/env';
import { ApiError } from '../../src/worker/lib/errors';
import { requireRole } from '../../src/worker/middleware/role';
import { session } from '../../src/worker/middleware/session';
import { authed } from '../../src/worker/middleware/tenant';
import { hashPassword } from '../../src/worker/security/password';
import { postJson, sessionCookie, signUp } from './helpers';

describe('hasRole', () => {
  it('ranks owner above admin above staff', () => {
    const table: [Role, Role, boolean][] = [
      ['owner', 'owner', true],
      ['owner', 'admin', true],
      ['owner', 'staff', true],
      ['admin', 'owner', false],
      ['admin', 'admin', true],
      ['admin', 'staff', true],
      ['staff', 'owner', false],
      ['staff', 'admin', false],
      ['staff', 'staff', true],
    ];
    for (const [role, minimum, expected] of table) {
      expect(hasRole(role, minimum), `${role} vs ${minimum}`).toBe(expected);
    }
  });
});

// A small app with one route per role, wired like the real API.
const app = new Hono<AppEnv>();
app.use(session);
for (const role of ROLES) {
  app.get(`/only-${role}`, ...authed, requireRole(role), (c) => c.json({ ok: true }));
}
app.onError((err, c) =>
  err instanceof ApiError ? c.json(err.toBody(), err.status) : c.json({ error: 'internal' }, 500),
);

async function cookieFor(role: Role) {
  const owner = await signUp();
  if (role === 'owner') return owner.cookie;
  const username = `${role}-user`;
  await env.DB.prepare(
    `INSERT INTO users (id, shop_id, username, display_name, role, password_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      owner.shopId,
      username,
      username,
      role,
      await hashPassword('role test password', 'test-pepper'),
      Date.now(),
    )
    .run();
  const res = await postJson('/auth/login', {
    shopSlug: owner.body.shopSlug,
    username,
    password: 'role test password',
  });
  return sessionCookie(res);
}

function get(path: string, cookie?: string) {
  return app.request(path, cookie ? { headers: { cookie } } : {}, env);
}

describe('requireRole', () => {
  it('lets each role in only where it is allowed', async () => {
    for (const role of ROLES) {
      const cookie = await cookieFor(role);
      for (const route of ROLES) {
        const res = await get(`/only-${route}`, cookie);
        expect(res.status, `${role} → /only-${route}`).toBe(hasRole(role, route) ? 200 : 403);
        if (res.status === 403) {
          expect(await res.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
        }
      }
    }
  });

  it('asks for a login before checking the role', async () => {
    const res = await get('/only-staff');
    expect(res.status).toBe(401);
  });

  it('uses the role in the database, so a demotion applies immediately', async () => {
    const owner = await signUp();
    expect((await get('/only-owner', owner.cookie)).status).toBe(200);
    await env.DB.prepare("UPDATE users SET role = 'staff' WHERE id = ?").bind(owner.userId).run();
    expect((await get('/only-admin', owner.cookie)).status).toBe(403);
  });
});
