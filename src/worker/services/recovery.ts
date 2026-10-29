import { and, count, eq, isNull } from 'drizzle-orm';

import type { RecoverInput } from '@shared/schemas/auth';

import type { Db } from '../db/client';
import { recoveryCodes, sessions, shops, users } from '../db/schema';
import { ApiError } from '../lib/errors';
import { hashPassword } from '../security/password';
import { hashRecoveryCode } from '../security/recovery-codes';
import { TooManyAttemptsError } from './login';
import {
  attemptKeys,
  clearUserFailures,
  failureCounts,
  isRateLimited,
  recordFailure,
  retryAfterSeconds,
} from './rate-limit';

export type RecoverResult = { userId: string; shopId: string; remainingCodes: number };

const INVALID_RECOVERY = () =>
  new ApiError(401, 'INVALID_RECOVERY', 'Shop code, username or recovery code is incorrect.');

/**
 * Resets an owner's password with a one-time code, then signs out every device.
 * Only owners have codes; staff and admins are reset by an admin.
 */
export async function recoverAccount(
  db: Db,
  pepper: string,
  input: RecoverInput,
  ipHash: string | null,
  now: number = Date.now(),
): Promise<RecoverResult> {
  const keys = attemptKeys(input.shopSlug, input.username, ipHash, 'recover');
  if (isRateLimited(await failureCounts(db, keys, now))) {
    throw new TooManyAttemptsError(retryAfterSeconds(now));
  }

  const owner = await db
    .select({ id: users.id, shopId: users.shopId })
    .from(users)
    .innerJoin(shops, eq(shops.id, users.shopId))
    .where(
      and(
        eq(shops.slug, input.shopSlug),
        eq(users.username, input.username),
        eq(users.role, 'owner'),
        eq(users.active, true),
        isNull(shops.deletedAt),
      ),
    )
    .get();

  const codeHash = await hashRecoveryCode(input.code, pepper);

  // Spend the code atomically: of two simultaneous requests, only one can match.
  const spent = owner
    ? await db
        .update(recoveryCodes)
        .set({ usedAt: now })
        .where(
          and(
            eq(recoveryCodes.userId, owner.id),
            eq(recoveryCodes.codeHash, codeHash),
            isNull(recoveryCodes.usedAt),
          ),
        )
        .run()
    : null;

  if (!owner || spent?.meta.changes !== 1) {
    await recordFailure(db, keys, now);
    throw INVALID_RECOVERY();
  }

  const passwordHash = await hashPassword(input.newPassword, pepper);
  await db.batch([
    db
      .update(users)
      .set({ passwordHash, failedLogins: 0, lockedUntil: null })
      .where(and(eq(users.id, owner.id), eq(users.shopId, owner.shopId))),
    // Whoever had the old password is signed out everywhere.
    db
      .update(sessions)
      .set({ revokedAt: now })
      .where(
        and(
          eq(sessions.userId, owner.id),
          eq(sessions.shopId, owner.shopId),
          isNull(sessions.revokedAt),
        ),
      ),
  ]);
  await clearUserFailures(db, keys);

  const remaining = await db
    .select({ n: count() })
    .from(recoveryCodes)
    .where(and(eq(recoveryCodes.userId, owner.id), isNull(recoveryCodes.usedAt)))
    .get();

  return { userId: owner.id, shopId: owner.shopId, remainingCodes: remaining?.n ?? 0 };
}
