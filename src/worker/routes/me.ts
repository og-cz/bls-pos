import { eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { entitlementsFor } from '@shared/entitlements';
import { disableTotpSchema, enableTotpSchema } from '@shared/schemas/auth';
import { changePasswordSchema, updateProfileSchema } from '@shared/schemas/profile';
import { parseTheme } from '@shared/theme';

import { R2Storage } from '../adapters/storage/r2';
import { getDb } from '../db/client';
import { shops } from '../db/schema';
import type { AuthedEnv } from '../env';
import { actorOf } from '../lib/actor';
import { mediaUrl } from '../lib/media';
import { parseJson } from '../lib/validate';
import { requireRole } from '../middleware/role';
import { authed } from '../middleware/tenant';
import { avatarUrlOf, changeOwnPassword, removeAvatar, updateProfile } from '../services/profile';
import { recoveryCodesLeft, regenerateRecoveryCodes } from '../services/recovery';
import { listMySessions, revokeMyOtherSessions, revokeMySession } from '../services/sessions';
import {
  disableTwoFactor,
  enableTwoFactor,
  startTwoFactorSetup,
  twoFactorStatus,
} from '../services/two-factor';

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
  const db = getDb(c.env.DB);
  const actor = await actorOf(c);
  const shop = await db
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
    user: {
      id: userId,
      username,
      displayName,
      role,
      avatarUrl: await avatarUrlOf(db, shopId, actor),
    },
    shop: {
      ...rest,
      theme: parseStoredTheme(themeJson),
      logoUrl: logoKey ? mediaUrl(logoKey) : null,
      coverUrl: coverKey ? mediaUrl(coverKey) : null,
    },
    entitlements: entitlementsFor(rest.plan),
  });
});

// Everyone edits their own profile: display name and photo (the photo is uploaded at
// POST /uploads/avatar).
meRoutes.patch('/', async (c) => {
  const input = await parseJson(c, updateProfileSchema);
  return c.json(await updateProfile(getDb(c.env.DB), c.var.shopId, await actorOf(c), input));
});

meRoutes.delete('/avatar', async (c) => {
  await removeAvatar(getDb(c.env.DB), c.var.shopId, new R2Storage(c.env.MEDIA), await actorOf(c));
  return c.json({ ok: true });
});

// The owner's recovery codes (Section 7.12): how many are left, and a new set.
meRoutes.get('/recovery-codes', async (c) => {
  const left = await recoveryCodesLeft(getDb(c.env.DB), c.var.shopId, await actorOf(c));
  return c.json({ remaining: left });
});

meRoutes.post('/recovery-codes', async (c) => {
  const codes = await regenerateRecoveryCodes(
    getDb(c.env.DB),
    c.var.shopId,
    await actorOf(c),
    c.env.PEPPER,
  );
  return c.json({ codes }, 201);
});

// Two-step login (Section 7.11): status, a new secret to scan, turn on, turn off.
meRoutes.get('/2fa', async (c) => {
  return c.json(await twoFactorStatus(getDb(c.env.DB), c.var.shopId, await actorOf(c)));
});

meRoutes.post('/2fa/setup', requireRole('admin'), async (c) => {
  return c.json(await startTwoFactorSetup(getDb(c.env.DB), c.var.shopId, await actorOf(c)));
});

meRoutes.post('/2fa/enable', requireRole('admin'), async (c) => {
  const input = await parseJson(c, enableTotpSchema);
  await enableTwoFactor(
    getDb(c.env.DB),
    c.var.shopId,
    await actorOf(c),
    c.var.auth.sessionId,
    c.env.TOTP_ENC_KEY,
    input,
  );
  return c.json({ enabled: true });
});

meRoutes.post('/2fa/disable', async (c) => {
  const input = await parseJson(c, disableTotpSchema);
  await disableTwoFactor(
    getDb(c.env.DB),
    c.var.shopId,
    await actorOf(c),
    c.env.TOTP_ENC_KEY,
    input,
  );
  return c.json({ enabled: false });
});

// Where you are signed in (Section 7.2): list, log out one, log out all the others.
meRoutes.get('/sessions', async (c) => {
  const list = await listMySessions(
    getDb(c.env.DB),
    c.var.shopId,
    await actorOf(c),
    c.var.auth.sessionId,
  );
  return c.json({ sessions: list });
});

meRoutes.delete('/sessions/:id', async (c) => {
  await revokeMySession(getDb(c.env.DB), c.var.shopId, await actorOf(c), c.req.param('id'));
  return c.json({ ok: true });
});

meRoutes.post('/sessions/revoke-others', async (c) => {
  await revokeMyOtherSessions(
    getDb(c.env.DB),
    c.var.shopId,
    await actorOf(c),
    c.var.auth.sessionId,
  );
  return c.json({ ok: true });
});

meRoutes.post('/password', async (c) => {
  const input = await parseJson(c, changePasswordSchema);
  await changeOwnPassword(
    getDb(c.env.DB),
    c.var.shopId,
    c.env.PEPPER,
    await actorOf(c),
    c.var.auth.sessionId,
    input,
  );
  return c.json({ ok: true });
});
