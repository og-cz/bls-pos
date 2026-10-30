import { expect, test } from '@playwright/test';

import { addProduct, createShop, skipTours } from './helpers';

// The flows a shop can't live without (Section 7.15): add a product, sell it, give
// change, see it in the dashboard; a cashier logs in and sells; a sale made offline is
// sent once the connection is back.

test.beforeEach(async ({ page }) => {
  await skipTours(page);
});

test('owner adds a product and makes a cash sale', async ({ page }) => {
  await page.goto('/login');
  await createShop(page);

  await page.goto('/products');
  await page.getByRole('button', { name: 'Add product' }).first().click();
  await page.getByLabel('Name', { exact: true }).fill('Brake Pad Set');
  await page.getByLabel('Price (₱)').fill('650');
  await page.getByLabel('Opening stock').fill('5');
  await page.getByRole('button', { name: 'Add product' }).last().click();
  await expect(page.getByText('Brake Pad Set').filter({ visible: true }).first()).toBeVisible();

  await page.goto('/sell');
  await page.getByRole('button', { name: /^Add Brake Pad Set/ }).click();
  await page
    .getByRole('button', { name: /Charge|item/ })
    .first()
    .click();
  const charge = page.getByRole('button', { name: /^Charge/ });
  if (await charge.isVisible()) await charge.click();
  await page.getByRole('button', { name: '₱1,000.00' }).click();
  await page.getByRole('button', { name: 'Complete sale' }).click();

  await expect(page.getByRole('dialog').getByText('₱350.00').first()).toBeVisible(); // change
  await expect(page.getByRole('heading', { name: 'Sale #1' })).toBeVisible();
  await expect(
    page.getByRole('dialog').getByText('not an official receipt or invoice'),
  ).toBeVisible();

  await page.goto('/');
  await expect(page.getByText("Today's sales")).toBeVisible();
  await expect(page.getByText('₱650.00').first()).toBeVisible();
});

test('a cashier logs in and lands on Sell', async ({ page, browser }) => {
  await page.goto('/login');
  const shop = await createShop(page);
  await addProduct(page.request, { name: 'Engine Oil 1L', priceCents: 35_000, stock: 10 });
  const res = await page.request.post('/api/v1/staff', {
    headers: { origin: 'http://localhost:5180' },
    data: { displayName: 'Ana', username: 'ana', role: 'staff' },
  });
  const { temporaryPassword } = (await res.json()) as { temporaryPassword: string };

  const staff = await browser.newPage();
  await staff.goto('/login');
  await staff.getByLabel('Shop code').fill(shop.slug);
  await staff.getByLabel('Username').fill('ana');
  await staff.getByLabel('Password', { exact: true }).fill(temporaryPassword);
  await staff.getByRole('button', { name: 'Log in' }).click();
  await expect(staff).toHaveURL(/\/sell$/);
  await expect(staff.getByRole('button', { name: /^Add Engine Oil 1L/ })).toBeVisible();
  // Staff never see the dashboard or costs.
  await staff.goto('/');
  await expect(staff).toHaveURL(/\/sell$/);
  await staff.close();
});

test('a sale made offline is sent when the connection returns', async ({ page, context }) => {
  await page.goto('/login');
  await createShop(page);
  await addProduct(page.request, { name: 'Spark Plug', priceCents: 18_000, stock: 30 });

  await page.goto('/sell');
  await expect(page.getByRole('button', { name: /^Add Spark Plug/ })).toBeVisible();
  await context.setOffline(true);

  await page.getByRole('button', { name: /^Add Spark Plug/ }).click();
  await page
    .getByRole('button', { name: /Charge|item/ })
    .first()
    .click();
  const charge = page.getByRole('button', { name: /^Charge/ });
  if (await charge.isVisible()) await charge.click();
  await page.getByRole('button', { name: 'Complete sale' }).click();
  await expect(page.getByRole('dialog').getByText('Sale number: when back online')).toBeVisible();
  await expect(page.getByText(/Offline · 1 unsent/)).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText(/Offline · 1 unsent/)).toBeHidden({ timeout: 15_000 });

  await page.goto('/sales');
  await expect(page.getByText('#1').first()).toBeVisible();
});
