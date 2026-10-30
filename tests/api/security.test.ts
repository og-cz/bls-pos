import { describe, expect, it } from 'vitest';

import { hasRole, type Role } from '../../src/shared/roles';
import { app } from '../../src/worker/index';
import { addMember, api, createProductAs, postJson, signUp } from './helpers';

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
  'POST /api/v1/audit/exports': 'admin',
  'POST /api/v1/audit/restores': 'admin',
  'GET /api/v1/products': 'staff',
  'GET /api/v1/products/:id': 'staff',
  'POST /api/v1/products': 'admin',
  'PATCH /api/v1/products/:id': 'admin',
  'POST /api/v1/products/import': 'admin',
  'POST /api/v1/products/:id/archive': 'admin',
  'POST /api/v1/products/:id/unarchive': 'admin',
  'GET /api/v1/categories': 'staff',
  'POST /api/v1/categories': 'admin',
  'PATCH /api/v1/categories/:id': 'admin',
  'DELETE /api/v1/categories/:id': 'admin',
  // Avatars are for everyone; the service limits the other kinds to admins (uploads.test.ts).
  'POST /api/v1/uploads/:kind': 'staff',
  'GET /api/v1/media/*': 'staff',
  'POST /api/v1/inventory/restock': 'admin',
  'POST /api/v1/inventory/deduct': 'staff',
  'GET /api/v1/inventory/movements': 'staff',
  'GET /api/v1/inventory/alerts': 'staff',
  'POST /api/v1/sales': 'staff',
  'GET /api/v1/sales/:id': 'staff',
  'POST /api/v1/sales/:id/void': 'admin',
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
  if (route === 'POST /api/v1/products') {
    return postJson(rel, { name: 'Test item', priceCents: 100 }, cookie);
  }
  if (rel.includes('/products/:id')) {
    const product = await createProductAs(shop.cookie);
    const target = rel.replace(':id', product.id);
    if (method === 'PATCH') {
      return api(target, {
        method,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ priceCents: 150 }),
      });
    }
    if (method === 'POST') return postJson(target, {}, cookie);
    return api(target, { headers: { cookie } });
  }
  if (route === 'POST /api/v1/categories') {
    return postJson(rel, { name: `Cat ${crypto.randomUUID().slice(0, 6)}` }, cookie);
  }
  if (rel.includes('/categories/:id')) {
    const made = await postJson('/categories', { name: `Cat ${crypto.randomUUID()}` }, shop.cookie);
    const { category } = await made.json<{ category: { id: string } }>();
    return api(rel.replace(':id', category.id), {
      method,
      headers: { cookie, 'content-type': 'application/json' },
      ...(method === 'PATCH' ? { body: JSON.stringify({ sortOrder: 2 }) } : {}),
    });
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
