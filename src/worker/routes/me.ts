import { eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { entitlementsFor } from '@shared/entitlements';
import { parseTheme } from '@shared/theme';

import { getDb } from '../db/client';
import { shops } from '../db/schema';
import type { AuthedEnv } from '../env';
import { mediaUrl } from '../lib/media';
import { authed } from '../middleware/tenant';

function parseStoredTheme(json: string) {
  try {
    return parseTheme(JSON.parse(json));
  } catch {
    return parseTheme(null);
  }
}

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
      logoKey: shops.logoKey,
      coverKey: shops.coverKey,
      onboardingStep: shops.onboardingStep,
    })
    .from(shops)
    .where(eq(shops.id, shopId))
    .get();

  if (!shop) return c.json({ error: { code: 'NOT_FOUND', message: 'Shop not found' } }, 404);
  const { themeJson, logoKey, coverKey, ...rest } = shop;
  return c.json({
    user: { id: userId, username, displayName, role },
    shop: {
      ...rest,
      theme: parseStoredTheme(themeJson),
      logoUrl: logoKey ? mediaUrl(logoKey) : null,
      coverUrl: coverKey ? mediaUrl(coverKey) : null,
    },
    entitlements: entitlementsFor(rest.plan),
  });
});
