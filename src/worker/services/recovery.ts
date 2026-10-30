import { and, count, eq, isNull } from 'drizzle-orm';

import type { RecoverInput } from '@shared/schemas/auth';

import type { Db } from '../db/client';
import { recoveryCodes, sessions, shops, users } from '../db/schema';
import { newId } from '../db/id';
import type { Actor } from '../lib/actor';
import { ApiError } from '../lib/errors';
import { hashPassword } from '../security/password';
import { hashRecoveryCode, newRecoveryCode, RECOVERY_CODE_COUNT } from '../security/recovery-codes';
import { TooManyAttemptsError } from './login';
import {
  attemptKeys,
  clearUserFailures,
  failureCounts,
  isRateLimited,
  recordFailure,
  retryAfterSeconds,
} from './rate-limit';
import { auditInsert, writeAudit } from './audit';

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
    if (owner) {
      await writeAudit(
        db,
        owner.shopId,
        { action: 'recover.failed', target: { type: 'user', id: owner.id }, ipHash },
        now,
      );
    }
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
    auditInsert(
      db,
      owner.shopId,
      {
        action: 'password.recover',
        userId: owner.id,
        target: { type: 'user', id: owner.id },
        ipHash,
      },
      now,
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

function ownerOnly(actor: Actor) {
  if (actor.role !== 'owner') {
    throw new ApiError(403, 'FORBIDDEN', 'Only the owner has recovery codes.');
  }
}

/** How many of the owner's recovery codes are still unused. */
export async function recoveryCodesLeft(db: Db, shopId: string, actor: Actor): Promise<number> {
  ownerOnly(actor);
  const row = await db
    .select({ n: count() })
    .from(recoveryCodes)
    .innerJoin(users, eq(users.id, recoveryCodes.userId))
    .where(
      and(
        eq(recoveryCodes.userId, actor.userId),
        eq(users.shopId, shopId),
        isNull(recoveryCodes.usedAt),
      ),
    )
    .get();
  return row?.n ?? 0;
}

/**
 * A fresh set of recovery codes for the owner (Section 7.12), e.g. when the old ones were
 * lost or used up. The old codes stop working at once. Shown once; only hashes are kept.
 */
export async function regenerateRecoveryCodes(
  db: Db,
  shopId: string,
  actor: Actor,
  pepper: string,
  now: number = Date.now(),
): Promise<string[]> {
  ownerOnly(actor);
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, newRecoveryCode);
  const rows = await Promise.all(
    codes.map(async (code) => ({
      id: newId(now),
      userId: actor.userId,
      codeHash: await hashRecoveryCode(code, pepper),
    })),
  );
  await db.batch([
    db.delete(recoveryCodes).where(eq(recoveryCodes.userId, actor.userId)),
    db.insert(recoveryCodes).values(rows),
    auditInsert(
      db,
      shopId,
      {
        action: 'recovery.regenerate',
        userId: actor.userId,
        target: { type: 'user', id: actor.userId },
        ipHash: actor.ipHash,
      },
      now,
    ),
  ]);
  return codes;
}
