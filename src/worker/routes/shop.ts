import { Hono } from 'hono';

import { onboardingSchema, shopSettingsSchema } from '@shared/schemas/shop';
import { themeSchema } from '@shared/theme';

import { R2Storage } from '../adapters/storage/r2';
import { getDb } from '../db/client';
import type { AuthedEnv } from '../env';
import { actorOf } from '../lib/actor';
import { parseJson } from '../lib/validate';
import { requireRole } from '../middleware/role';
import { authed } from '../middleware/tenant';
import {
  getShopSettings,
  removeShopImage,
  setOnboardingStep,
  updateShopSettings,
  updateTheme,
} from '../services/shop';

export const shopRoutes = new Hono<AuthedEnv>();

shopRoutes.use(...authed);

shopRoutes.get('/', async (c) => {
  return c.json({ shop: await getShopSettings(getDb(c.env.DB), c.var.shopId) });
});

shopRoutes.patch('/', requireRole('admin'), async (c) => {
  const input = await parseJson(c, shopSettingsSchema);
  const shop = await updateShopSettings(getDb(c.env.DB), c.var.shopId, await actorOf(c), input);
  return c.json({ shop });
});

shopRoutes.patch('/onboarding', requireRole('admin'), async (c) => {
  const { step } = await parseJson(c, onboardingSchema);
  await setOnboardingStep(getDb(c.env.DB), c.var.shopId, step);
  return c.json({ step });
});

// Branding is for admins and the owner (Section 6.4).
shopRoutes.patch('/theme', requireRole('admin'), async (c) => {
  const input = await parseJson(c, themeSchema);
  const theme = await updateTheme(getDb(c.env.DB), c.var.shopId, await actorOf(c), input);
  return c.json({ theme });
});

shopRoutes.delete('/logo', requireRole('admin'), async (c) => {
  await removeShopImage(getDb(c.env.DB), c.var.shopId, new R2Storage(c.env.MEDIA), 'logo');
  return c.json({ ok: true });
});

shopRoutes.delete('/cover', requireRole('admin'), async (c) => {
  await removeShopImage(getDb(c.env.DB), c.var.shopId, new R2Storage(c.env.MEDIA), 'cover');
  return c.json({ ok: true });
});
