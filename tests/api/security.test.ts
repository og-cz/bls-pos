import { describe, expect, it } from 'vitest';

import { hasRole, type Role } from '../../src/shared/roles';
import app from '../../src/worker/index';
import { addMember, api, postJson, signUp } from './helpers';

// Every API route and the lowest role allowed to call it (Section 5.2).
// 'public' = no session needed. A new route must be added here, or the first test fails.
type Access = 'public' | Role;
const ROUTES: Record<string, Access> = {
  'GET /api/v1/health': 'public',
  'POST /api/v1/auth/signup': 'public',
  'POST /api/v1/auth/login': 'public',
  'POST /api/v1/auth/recover': 'public',
  'POST /api/v1/auth/logout': 'staff',
  'GET /api/v1/me': 'staff',
  'GET /api/v1/staff': 'admin',
  'POST /api/v1/staff': 'admin',
  'POST /api/v1/staff/:id/deactivate': 'admin',
  'GET /api/v1/audit': 'admin',
};

type Shop = Awaited<ReturnType<typeof signUp>>;

/** A valid request for each protected route, so a 403 can only mean "wrong role". */
async function requestFor(route: string, shop: Shop, cookie: string): Promise<Response> {
  const [method = 'GET', path = ''] = route.split(' ');
  const rel = path.replace('/api/v1', '');
  if (route === 'POST /api/v1/staff') {
    const username = `new-${crypto.randomUUID().slice(0, 6)}`;
    return postJson(rel, { username, displayName: 'New', role: 'staff' }, cookie);
  }
  if (route === 'POST /api/v1/staff/:id/deactivate') {
    const target = await addMember(shop, 'staff');
    return postJson(rel.replace(':id', target.id), {}, cookie);
  }
  return api(rel, {
    method,
    headers: { cookie, ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) },
    ...(method === 'POST' ? { body: '{}' } : {}),
  });
}

const protectedRoutes = Object.entries(ROUTES).filter(([, access]) => access !== 'public') as [
  string,
  Role,
][];

describe('route inventory', () => {
  it('every API route has a declared access level', () => {
    const registered = app.routes
      .filter((r) => r.method !== 'ALL')
      .map((r) => `${r.method} ${r.path}`);
    const unknown = registered.filter((r) => !(r in ROUTES));
    expect(unknown).toEqual([]);
    expect(new Set(registered)).toEqual(new Set(Object.keys(ROUTES)));
  });
});

describe('authentication', () => {
  it('every non-public route refuses requests without a session', async () => {
    const shop = await signUp();
    for (const [route] of protectedRoutes) {
      const res = await requestFor(route, shop, '');
      expect(res.status, route).toBe(401);
    }
  });

  it('every non-public route refuses a forged session cookie', async () => {
    const shop = await signUp();
    for (const [route] of protectedRoutes) {
      const res = await requestFor(route, shop, '__Host-bls_session=forged-token-value-123');
      expect(res.status, route).toBe(401);
    }
  });
});

describe('role permissions', () => {
  for (const role of ['staff', 'admin', 'owner'] as const) {
    it(`${role}: allowed exactly where the role permits`, async () => {
      const shop = await signUp();
      const memberRole = role === 'owner' ? null : role;
      const member = memberRole ? await addMember(shop, memberRole) : null;
      for (const [route, minimum] of protectedRoutes) {
        // Logging out ends the session, so it gets a session of its own.
        const cookie =
          route === 'POST /api/v1/auth/logout'
            ? memberRole
              ? (await addMember(shop, memberRole)).cookie
              : (await signUp()).cookie
            : (member?.cookie ?? shop.cookie);
        const res = await requestFor(route, shop, cookie);
        if (hasRole(role, minimum)) {
          expect([401, 403], `${role} → ${route} (${res.status})`).not.toContain(res.status);
        } else {
          expect(res.status, `${role} → ${route}`).toBe(403);
        }
      }
    });
  }
});

describe('tenant isolation', () => {
  it("shop A's owner sees nothing of shop B through any endpoint", async () => {
    const a = await signUp();
    const b = await signUp({ shopName: 'Shop B Secret', ownerName: 'Bea Secret' });
    const bStaff = await addMember(b, 'staff', 'b-only-cashier');

    for (const path of ['/me', '/staff', '/audit']) {
      const res = await api(path, { headers: { cookie: a.cookie } });
      expect(res.status, path).toBe(200);
      const text = await res.text();
      for (const secret of [b.shopId, b.userId, bStaff.id, 'b-only-cashier', 'Bea Secret']) {
        expect(text, `${path} leaks ${secret}`).not.toContain(secret);
      }
    }
  });

  it("shop A's owner cannot change shop B's accounts", async () => {
    const a = await signUp();
    const b = await signUp();
    const bStaff = await addMember(b, 'staff');
    const res = await postJson(`/staff/${bStaff.id}/deactivate`, {}, a.cookie);
    expect(res.status).toBe(404);
    expect((await api('/me', { headers: { cookie: bStaff.cookie } })).status).toBe(200);
  });

  it('accounts created by shop A always belong to shop A, whatever the client sends', async () => {
    const a = await signUp();
    const b = await signUp();
    const res = await api(`/staff?shopId=${b.shopId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: a.cookie, 'x-shop-id': b.shopId },
      body: JSON.stringify({ username: 'placed', displayName: 'Placed' }),
    });
    expect(res.status).toBe(201);
    const bList = await (await api('/staff', { headers: { cookie: b.cookie } })).text();
    expect(bList).not.toContain('placed');
  });
});
