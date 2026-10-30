import type { APIRequestContext, Page } from '@playwright/test';

// Shops are created through the API (the signup form needs a real Turnstile check), then
// everything else happens in the browser like a person would.

let counter = 0;

export type TestShop = { slug: string; username: string; password: string };

export async function createShop(page: Page): Promise<TestShop> {
  counter += 1;
  const shop = {
    slug: `e2e-${String(Date.now()).slice(-7)}-${String(counter)}`,
    username: 'owner',
    password: 'a long test password here',
  };
  const base = new URL(page.url() === 'about:blank' ? 'http://localhost:5180' : page.url());
  const res = await page.request.post('/api/v1/auth/signup', {
    headers: { origin: base.origin },
    data: {
      shopName: 'E2E Moto Parts',
      shopSlug: shop.slug,
      businessType: 'retail',
      ownerName: 'Test Owner',
      username: shop.username,
      password: shop.password,
      turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX',
    },
  });
  if (res.status() !== 201) throw new Error(`signup failed: ${String(res.status())}`);
  // Skip the setup guide so tests start on the normal screens.
  await page.request.patch('/api/v1/shop/onboarding', {
    headers: { origin: base.origin },
    data: { step: 6 },
  });
  return shop;
}

export async function addProduct(
  request: APIRequestContext,
  product: { name: string; priceCents: number; stock?: number },
) {
  const res = await request.post('/api/v1/products', {
    headers: { origin: 'http://localhost:5180' },
    data: { trackStock: product.stock !== undefined, ...product },
  });
  if (res.status() !== 201) throw new Error(`product failed: ${String(res.status())}`);
  return (await res.json()) as { product: { id: string } };
}

/** Skips the first-visit guided tour, which would cover the screen. */
export async function skipTours(page: Page) {
  await page.addInitScript(() => {
    // Called below with the right `this` (the storage object).
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      return key.startsWith('bls:tour:') ? '1' : original.call(this, key);
    };
  });
}
