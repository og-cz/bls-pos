import { and, eq } from 'drizzle-orm';

import type { UpdateProfileInput } from '@shared/schemas/profile';

import type { StorageAdapter } from '../adapters/types';
import type { Db } from '../db/client';
import { users } from '../db/schema';
import type { Actor } from '../lib/actor';
import { mediaUrl } from '../lib/media';

/** The signed-in person's photo, if they added one. */
export async function avatarUrlOf(db: Db, shopId: string, actor: Actor): Promise<string | null> {
  const row = await db
    .select({ avatarKey: users.avatarKey })
    .from(users)
    .where(and(eq(users.id, actor.userId), eq(users.shopId, shopId)))
    .get();
  return row?.avatarKey ? mediaUrl(row.avatarKey) : null;
}

/** Changes the signed-in person's own display name. Nobody edits someone else's here. */
export async function updateProfile(
  db: Db,
  shopId: string,
  actor: Actor,
  input: UpdateProfileInput,
): Promise<{ displayName: string }> {
  await db
    .update(users)
    .set({ displayName: input.displayName })
    .where(and(eq(users.id, actor.userId), eq(users.shopId, shopId)));
  return { displayName: input.displayName };
}

/** Removes the signed-in person's photo, from their profile and from storage. */
export async function removeAvatar(
  db: Db,
  shopId: string,
  storage: StorageAdapter,
  actor: Actor,
): Promise<void> {
  const row = await db
    .select({ avatarKey: users.avatarKey })
    .from(users)
    .where(and(eq(users.id, actor.userId), eq(users.shopId, shopId)))
    .get();
  if (!row?.avatarKey) return;
  await db
    .update(users)
    .set({ avatarKey: null })
    .where(and(eq(users.id, actor.userId), eq(users.shopId, shopId)));
  await storage.delete(row.avatarKey);
}
