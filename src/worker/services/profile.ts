import { and, eq, isNull, ne } from 'drizzle-orm';

import { checkPassword, passwordProblemMessage } from '@shared/password-policy';
import type { ChangePasswordInput, UpdateProfileInput } from '@shared/schemas/profile';

import type { StorageAdapter } from '../adapters/types';
import type { Db } from '../db/client';
import { sessions, users } from '../db/schema';
import type { Actor } from '../lib/actor';
import { ApiError } from '../lib/errors';
import { mediaUrl } from '../lib/media';
import { hashPassword, verifyPassword } from '../security/password';
import { auditInsert } from './audit';

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

/**
 * Changes your own password (Section 7.1). The current password must be right, the new
 * one must pass the policy for your role, and every other device is signed out (7.2).
 */
export async function changeOwnPassword(
  db: Db,
  shopId: string,
  pepper: string,
  actor: Actor,
  sessionId: string,
  input: ChangePasswordInput,
  now: number = Date.now(),
): Promise<void> {
  const row = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(and(eq(users.id, actor.userId), eq(users.shopId, shopId)))
    .get();
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Account not found.');
  const { ok } = await verifyPassword(input.currentPassword, row.passwordHash, pepper);
  if (!ok) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Some fields need fixing.', {
      currentPassword: 'That is not your current password.',
    });
  }
  const problem = checkPassword(input.newPassword, actor.role);
  if (problem) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Some fields need fixing.', {
      newPassword: passwordProblemMessage(problem, actor.role),
    });
  }
  await db.batch([
    db
      .update(users)
      .set({ passwordHash: await hashPassword(input.newPassword, pepper) })
      .where(and(eq(users.id, actor.userId), eq(users.shopId, shopId))),
    db
      .update(sessions)
      .set({ revokedAt: now })
      .where(
        and(
          eq(sessions.userId, actor.userId),
          eq(sessions.shopId, shopId),
          ne(sessions.id, sessionId),
          isNull(sessions.revokedAt),
        ),
      ),
    auditInsert(
      db,
      shopId,
      {
        action: 'password.change',
        userId: actor.userId,
        target: { type: 'user', id: actor.userId },
        ipHash: actor.ipHash,
      },
      now,
    ),
  ]);
}
