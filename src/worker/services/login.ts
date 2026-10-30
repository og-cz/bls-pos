import { and, eq, isNull, sql } from 'drizzle-orm';

import type { LoginInput } from '@shared/schemas/auth';
import type { Role } from '@shared/roles';

import type { Db } from '../db/client';
import { shops, users } from '../db/schema';
import { ApiError } from '../lib/errors';
import { hashPassword, verifyPassword } from '../security/password';
import { decryptSecret, verifyTotp } from '../security/totp';
import {
  attemptKeys,
  clearUserFailures,
  failureCounts,
  isRateLimited,
  recordFailure,
  retryAfterSeconds,
} from './rate-limit';
import { auditInsert, writeAudit } from './audit';

export type LoginResult = { userId: string; shopId: string; role: Role };

// Section 7.3: ask for a Turnstile check once an account or IP has a few recent failures.
export const TURNSTILE_AFTER_USER_FAILURES = 3;
export const TURNSTILE_AFTER_IP_FAILURES = 10;

// Section 7.3: lock the account for 15 minutes after 10 failed logins.
export const LOCK_AFTER_FAILURES = 10;
export const LOCK_MS = 15 * 60 * 1000;

// Same message for an unknown shop, unknown user, wrong password or inactive account
// (Section 7.3), so the response never reveals which part was wrong.
export const INVALID_CREDENTIALS = () =>
  new ApiError(401, 'INVALID_CREDENTIALS', 'Shop code, username or password is incorrect.');

// Rate-limited and locked accounts get the same answer, so a lock does not confirm
// that the account exists.
export class TooManyAttemptsError extends ApiError {
  constructor(readonly retryAfter: number) {
    super(429, 'TOO_MANY_ATTEMPTS', 'Too many login attempts. Please wait and try again.');
  }
}

// When the user does not exist we still run a full hash, so response time does not
// reveal whether a username exists.
let dummyHash: Promise<string> | undefined;
function getDummyHash(pepper: string): Promise<string> {
  dummyHash ??= hashPassword('dummy password for timing only', pepper);
  return dummyHash;
}

export type LoginContext = {
  ipHash: string | null;
  /** TOTP_ENC_KEY, to read two-step login secrets. */
  totpKey: string;
  /** Throws unless the request carries a valid Turnstile token. */
  verifyHuman: () => Promise<void>;
};

export async function login(
  db: Db,
  pepper: string,
  input: LoginInput,
  ctx: LoginContext,
  now: number = Date.now(),
): Promise<LoginResult> {
  const keys = attemptKeys(input.shopSlug, input.username, ctx.ipHash);
  const counts = await failureCounts(db, keys, now);
  if (isRateLimited(counts)) {
    throw new TooManyAttemptsError(retryAfterSeconds(now));
  }
  if (counts.user >= TURNSTILE_AFTER_USER_FAILURES || counts.ip >= TURNSTILE_AFTER_IP_FAILURES) {
    await ctx.verifyHuman();
  }

  const user = await db
    .select({
      id: users.id,
      shopId: users.shopId,
      role: users.role,
      passwordHash: users.passwordHash,
      active: users.active,
      lockedUntil: users.lockedUntil,
      totpSecretEnc: users.totpSecretEnc,
    })
    .from(users)
    .innerJoin(shops, eq(shops.id, users.shopId))
    .where(
      and(
        eq(shops.slug, input.shopSlug),
        eq(users.username, input.username),
        isNull(shops.deletedAt),
      ),
    )
    .get();

  // Locked: refuse before hashing, so a locked account costs no CPU.
  if (user?.lockedUntil && user.lockedUntil > now) {
    throw new TooManyAttemptsError(Math.ceil((user.lockedUntil - now) / 1000));
  }

  const stored = user?.passwordHash ?? (await getDummyHash(pepper));
  const { ok, needsRehash } = await verifyPassword(input.password, stored, pepper);

  if (!user || !ok || !user.active) {
    await recordFailure(db, keys, now);
    if (user) {
      // Unknown usernames have no shop to log to; known accounts are logged for admins.
      const audit = { userId: user.id, target: { type: 'user', id: user.id }, ipHash: ctx.ipHash };
      await writeAudit(
        db,
        user.shopId,
        {
          ...audit,
          action: 'login.failed',
          details: { reason: ok ? 'inactive' : 'wrong_password' },
        },
        now,
      );
      if (!ok && (await countAccountFailure(db, user.shopId, user.id, now))) {
        await writeAudit(db, user.shopId, { ...audit, action: 'login.locked' }, now);
      }
    }
    throw INVALID_CREDENTIALS();
  }

  // Two-step login (Section 7.11): the password was right; now the app code.
  if (user.totpSecretEnc) {
    if (!input.totpCode) {
      throw new ApiError(
        401,
        'TOTP_REQUIRED',
        'Enter the 6-digit code from your authenticator app.',
      );
    }
    const secret = await decryptSecret(user.totpSecretEnc, ctx.totpKey);
    if (!(await verifyTotp(secret, input.totpCode, now))) {
      await recordFailure(db, keys, now);
      await writeAudit(
        db,
        user.shopId,
        {
          action: 'login.failed',
          userId: user.id,
          target: { type: 'user', id: user.id },
          details: { reason: 'wrong_code' },
          ipHash: ctx.ipHash,
        },
        now,
      );
      if (await countAccountFailure(db, user.shopId, user.id, now)) {
        await writeAudit(
          db,
          user.shopId,
          {
            action: 'login.locked',
            userId: user.id,
            target: { type: 'user', id: user.id },
            ipHash: ctx.ipHash,
          },
          now,
        );
      }
      throw new ApiError(
        401,
        'INVALID_TOTP',
        'That code is not right. Check the time on your phone and try again.',
      );
    }
  }

  await db.batch([
    db
      .update(users)
      .set({
        failedLogins: 0,
        lockedUntil: null,
        ...(needsRehash ? { passwordHash: await hashPassword(input.password, pepper) } : {}),
      })
      .where(and(eq(users.id, user.id), eq(users.shopId, user.shopId))),
    auditInsert(
      db,
      user.shopId,
      { action: 'login.success', userId: user.id, ipHash: ctx.ipHash },
      now,
    ),
  ]);
  await clearUserFailures(db, keys);

  return { userId: user.id, shopId: user.shopId, role: user.role };
}

/** Counts one failed password; returns true if this failure locked the account. */
async function countAccountFailure(
  db: Db,
  shopId: string,
  userId: string,
  now: number,
): Promise<boolean> {
  // One statement, so concurrent failures cannot skip past the threshold.
  const row = await db
    .update(users)
    .set({
      failedLogins: sql`CASE WHEN ${users.failedLogins} + 1 >= ${LOCK_AFTER_FAILURES} THEN 0 ELSE ${users.failedLogins} + 1 END`,
      lockedUntil: sql`CASE WHEN ${users.failedLogins} + 1 >= ${LOCK_AFTER_FAILURES} THEN ${now + LOCK_MS} ELSE ${users.lockedUntil} END`,
    })
    .where(and(eq(users.id, userId), eq(users.shopId, shopId)))
    .returning({ lockedUntil: users.lockedUntil })
    .get();
  return row.lockedUntil === now + LOCK_MS;
}
