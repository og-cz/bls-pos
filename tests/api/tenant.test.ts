import { describe, expect, it } from 'vitest';

import { api, signUp } from './helpers';

type Me = { shop: { id: string; slug: string } };

describe('tenant middleware', () => {
  it("uses the session's shop and ignores any shop the client names", async () => {
    const a = await signUp();
    const b = await signUp();
    const res = await api(`/me?shopId=${b.shopId}&shop_id=${b.shopId}`, {
      headers: { cookie: a.cookie, 'x-shop-id': b.shopId },
    });
    expect(res.status).toBe(200);
    expect((await res.json<Me>()).shop.id).toBe(a.shopId);
  });
});

// Section 7.4: "every service function takes shopId as its first argument" (after db).
// Functions that run before anyone is signed in look the shop up themselves and are
// listed here on purpose. Anything new must either take (db, shopId, ...) or be added
// here with a reason.
const PRE_TENANT = new Set([
  'login.login', // finds the shop from the shop code typed at login
  'recovery.recoverAccount', // same, for the recovery form
  'signup.createShopWithOwner', // creates the shop
  'sessions.resolveSession', // finds the shop from the session cookie
  'rate-limit.attemptKeys',
  'rate-limit.failureCounts',
  'rate-limit.isRateLimited',
  'rate-limit.retryAfterSeconds',
  'rate-limit.recordFailure',
  'rate-limit.clearUserFailures',
  'summaries.summaryStatement', // nightly cron: scoped to one shop or to every shop in a timezone
]);

const services = import.meta.glob<Record<string, unknown>>('../../src/worker/services/*.ts', {
  eager: true,
});

function paramNames(fn: (...args: never[]) => unknown): string[] {
  const src = fn.toString();
  const list = /^[^(]*\(([^)]*)\)/.exec(src)?.[1] ?? '';
  return list
    .split(',')
    .map((p) => p.trim().replace(/[=\s].*$/, ''))
    .filter(Boolean);
}

describe('service signatures', () => {
  it('found the service modules', () => {
    expect(Object.keys(services).length).toBeGreaterThan(3);
  });

  it('every tenant service takes (db, shopId, ...)', () => {
    const offenders: string[] = [];
    const checked: string[] = [];
    for (const [path, mod] of Object.entries(services)) {
      const file = path.split('/').pop()?.replace(/\.ts$/, '') ?? path;
      for (const [name, value] of Object.entries(mod)) {
        if (typeof value !== 'function' || /^[A-Z]/.test(name)) continue; // skip classes
        const id = `${file}.${name}`;
        if (PRE_TENANT.has(id)) continue;
        checked.push(id);
        const [first, second] = paramNames(value as (...args: never[]) => unknown);
        if (first !== 'db' || second !== 'shopId') offenders.push(`${id}(${first}, ${second})`);
      }
    }
    expect(checked).toContain('sessions.revokeSession');
    expect(offenders).toEqual([]);
  });
});
