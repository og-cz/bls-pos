import { exports } from 'cloudflare:workers';

export const ORIGIN = 'https://pos.test';

export function api(path: string, init: RequestInit = {}) {
  return exports.default.fetch(`${ORIGIN}/api/v1${path}`, init);
}

export function postJson(path: string, body: unknown) {
  return api(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

let counter = 0;

/** A valid signup body with a unique shop code. */
export function signupBody(overrides: Record<string, unknown> = {}) {
  counter += 1;
  return {
    shopName: 'Kape ni Juan',
    shopSlug: `test-shop-${counter}-${crypto.randomUUID().slice(0, 8)}`,
    businessType: 'cafe',
    ownerName: 'Juan Dela Cruz',
    username: 'juan',
    password: 'mainit na kape araw-araw',
    ...overrides,
  };
}
