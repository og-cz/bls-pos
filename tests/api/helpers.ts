import { env, exports } from 'cloudflare:workers';

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

/** Returns `__Host-bls_session=<token>` from a response, for use as a Cookie header. */
export function sessionCookie(res: Response): string {
  const header = res.headers.getSetCookie().find((c) => c.startsWith('__Host-bls_session='));
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
  const json = await res.json<{
    shop: { id: string };
    user: { id: string };
    recoveryCodes: string[];
  }>();
  return {
    body,
    shopId: json.shop.id,
    userId: json.user.id,
    recoveryCodes: json.recoveryCodes,
    cookie: sessionCookie(res),
  };
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
    turnstileToken: 'valid-token',
    ...overrides,
  };
}

type Member = { id: string; username: string; role: string };

/** Adds an admin or staff member through the API and logs them in. */
export async function addMember(
  owner: { body: { shopSlug: string }; cookie: string },
  role: 'admin' | 'staff',
  username = `${role}-${crypto.randomUUID().slice(0, 6)}`,
  actorCookie = owner.cookie,
) {
  const res = await postJson('/staff', { username, displayName: username, role }, actorCookie);
  if (res.status !== 201) throw new Error(`addMember failed: ${res.status}`);
  const { user, temporaryPassword } = await res.json<{
    user: Member;
    temporaryPassword: string;
  }>();
  const login = await postJson('/auth/login', {
    shopSlug: owner.body.shopSlug,
    username,
    password: temporaryPassword,
  });
  return { id: user.id, username, temporaryPassword, cookie: sessionCookie(login) };
}

type ProductJson = {
  id: string;
  name: string;
  sku: string | null;
  stock: number;
  priceCents: number;
};

/** Creates a product through the API with the given (admin or owner) session. */
export async function createProductAs(cookie: string, fields: Record<string, unknown> = {}) {
  const res = await postJson(
    '/products',
    { name: 'Iced Latte', priceCents: 12_000, ...fields },
    cookie,
  );
  if (res.status !== 201)
    throw new Error(`createProduct failed: ${res.status} ${await res.text()}`);
  return (await res.json<{ product: ProductJson }>()).product;
}

/** Fills a shop with `count` plain products in one statement (for limit tests). */
export async function fillProducts(shopId: string, count: number) {
  await env.DB.prepare(
    `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?)
     INSERT INTO products (id, shop_id, name, price_cents, created_at, updated_at)
     SELECT lower(hex(randomblob(16))), ?, 'Bulk ' || i, 100, 0, 0 FROM n`,
  )
    .bind(count, shopId)
    .run();
}
