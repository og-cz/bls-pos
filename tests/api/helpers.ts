import { exports } from 'cloudflare:workers';

export const ORIGIN = 'https://pos.test';

export function api(path: string, init: RequestInit = {}) {
  return exports.default.fetch(`${ORIGIN}/api/v1${path}`, init);
}

export function postJson(path: string, body: unknown, cookie?: string) {
  return api(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** Returns `__Host-bp_session=<token>` from a response, for use as a Cookie header. */
export function sessionCookie(res: Response): string {
  const header = res.headers.getSetCookie().find((c) => c.startsWith('__Host-bp_session='));
  if (!header) throw new Error('No session cookie set');
  return header.split(';')[0] ?? '';
}

export function getWithCookie(path: string, cookie: string) {
  return api(path, { headers: { cookie } });
}

/** Signs up a new shop and returns its details plus the owner's session cookie. */
export async function signUp(overrides: Record<string, unknown> = {}) {
  const body = signupBody(overrides);
  const res = await postJson('/auth/signup', body);
  if (res.status !== 201) throw new Error(`signup failed: ${res.status}`);
  const json = await res.json<{ shop: { id: string }; user: { id: string } }>();
  return { body, shopId: json.shop.id, userId: json.user.id, cookie: sessionCookie(res) };
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
