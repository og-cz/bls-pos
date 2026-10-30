import { eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { entitlementsFor } from '@shared/entitlements';

import { getDb } from '../db/client';
import { shops } from '../db/schema';
import type { AuthedEnv } from '../env';
import { authed } from '../middleware/tenant';

export const meRoutes = new Hono<AuthedEnv>();

meRoutes.use(...authed);

meRoutes.get('/', async (c) => {
  const { shopId } = c.var;
  const { userId, role, username, displayName } = c.var.auth;
  const shop = await getDb(c.env.DB)
    .select({
      id: shops.id,
      slug: shops.slug,
      name: shops.name,
      businessType: shops.businessType,
      plan: shops.plan,
      currency: shops.currency,
      themeJson: shops.themeJson,
      onboardingStep: shops.onboardingStep,
    })
    .from(shops)
    .where(eq(shops.id, shopId))
    .get();

  if (!shop) return c.json({ error: { code: 'NOT_FOUND', message: 'Shop not found' } }, 404);
  const { themeJson, ...rest } = shop;
  return c.json({
    user: { id: userId, username, displayName, role },
    shop: { ...rest, theme: JSON.parse(themeJson) as unknown },
    entitlements: entitlementsFor(rest.plan),
  });
});
