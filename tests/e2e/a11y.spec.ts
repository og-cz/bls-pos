import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { addProduct, createShop, skipTours } from './helpers';

// Accessibility (Section 6.1: WCAG 2.2 AA): every screen is scanned with axe in light and
// dark mode. A violation fails the test with its rule, element and fix.

async function scan(page: Page, path: string) {
  await page.goto(path);
  // (Not 'networkidle': the Turnstile widget on signup keeps talking to Cloudflare.)
  await page.waitForLoadState('load');
  await page.locator('main').first().waitFor();
  await page.waitForTimeout(400);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const problems = results.violations.map(
    (v) =>
      `${v.id} (${v.impact ?? ''}): ${v.help}\n  ${v.nodes
        .map((n) => `${n.target.join(' ')}: ${n.failureSummary?.replace(/\s+/g, ' ') ?? ''}`)
        .slice(0, 3)
        .join('\n  ')}`,
  );
  // Soft: report every screen's problems in one run, not just the first.
  expect.soft(problems, `${path}\n${problems.join('\n')}`).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await skipTours(page);
});

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} mode`, () => {
    test.use({ colorScheme: scheme });

    test('public screens', async ({ page }) => {
      for (const path of ['/login', '/signup', '/recover', '/privacy', '/terms']) {
        await scan(page, path);
      }
    });

    test('signed-in screens', async ({ page }) => {
      await page.goto('/login');
      const shop = await createShop(page);
      await addProduct(page.request, { name: 'Engine Oil 1L', priceCents: 35_000, stock: 3 });
      for (const path of [
        '/',
        '/sell',
        '/sales',
        '/inventory',
        '/products',
        '/staff',
        '/shop-page',
        '/branding',
        '/activity',
        '/settings',
        '/help',
        '/profile',
      ]) {
        await scan(page, path);
      }
      await page.request.patch('/api/v1/shop', {
        headers: { origin: 'http://localhost:5180' },
        data: { storefrontEnabled: true },
      });
      await scan(page, `/s/${shop.slug}`);
    });
  });
}
