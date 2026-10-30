import { eq } from 'drizzle-orm';

import { themeSchema, type Theme } from '@shared/theme';

import type { StorageAdapter } from '../adapters/types';
import type { Db } from '../db/client';
import { shops } from '../db/schema';
import type { Actor } from '../lib/actor';
import { auditStatement } from './audit';

/**
 * Saves the shop's theme (Section 6.2). Already validated by `themeSchema`; parsed again
 * here so only known fields are ever stored. Logged with the old and new brand color.
 */
export async function updateTheme(
  db: Db,
  shopId: string,
  actor: Actor,
  input: Theme,
  now: number = Date.now(),
): Promise<Theme> {
  const theme = themeSchema.parse(input);
  const before = await db
    .select({ themeJson: shops.themeJson })
    .from(shops)
    .where(eq(shops.id, shopId))
    .get();
  let previous: unknown;
  try {
    previous = before ? (JSON.parse(before.themeJson) as { brand?: unknown }).brand : null;
  } catch {
    previous = null;
  }
  await db.$client.batch([
    db.$client
      .prepare('UPDATE shops SET theme_json = ?2 WHERE id = ?1')
      .bind(shopId, JSON.stringify(theme)),
    auditStatement(
      db,
      shopId,
      {
        action: 'shop.theme',
        userId: actor.userId,
        details: { from: previous, to: theme.brand, preset: theme.presetId ?? null },
        ipHash: actor.ipHash,
      },
      now,
    ),
  ]);
  return theme;
}

/** Removes the shop's logo or cover photo, from the shop and from storage. */
export async function removeShopImage(
  db: Db,
  shopId: string,
  storage: StorageAdapter,
  kind: 'logo' | 'cover',
): Promise<void> {
  const shop = await db
    .select({ logoKey: shops.logoKey, coverKey: shops.coverKey })
    .from(shops)
    .where(eq(shops.id, shopId))
    .get();
  const key = kind === 'logo' ? shop?.logoKey : shop?.coverKey;
  if (!key) return;
  await db
    .update(shops)
    .set(kind === 'logo' ? { logoKey: null } : { coverKey: null })
    .where(eq(shops.id, shopId));
  await storage.delete(key);
}
