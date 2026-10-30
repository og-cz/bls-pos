import { and, eq, isNull, ne } from 'drizzle-orm';

import { APP_NAME } from '@shared/app';
import { hasRole } from '@shared/roles';

import type { Db } from '../db/client';
import { sessions, shops, users } from '../db/schema';
import type { Actor } from '../lib/actor';
import { ApiError } from '../lib/errors';
import {
  decryptSecret,
  encryptSecret,
  newTotpSecret,
  otpauthUri,
  verifyTotp,
} from '../security/totp';
import { auditInsert } from './audit';

// Optional two-step login for owners and admins (Section 7.11).

function adminsOnly(actor: Actor) {
  if (!hasRole(actor.role, 'admin')) {
    throw new ApiError(403, 'FORBIDDEN', 'Two-step login is for owners and admins.');
  }
}

async function userRow(db: Db, shopId: string, actor: Actor) {
  const row = await db
    .select({ username: users.username, totp: users.totpSecretEnc, slug: shops.slug })
    .from(users)
    .innerJoin(shops, eq(shops.id, users.shopId))
    .where(and(eq(users.id, actor.userId), eq(users.shopId, shopId)))
    .get();
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Account not found.');
  return row;
}

export async function twoFactorStatus(
  db: Db,
  shopId: string,
  actor: Actor,
): Promise<{ available: boolean; enabled: boolean }> {
  const row = await userRow(db, shopId, actor);
  return { available: hasRole(actor.role, 'admin'), enabled: row.totp !== null };
}

/**
 * A new secret for the authenticator app to scan. Nothing is saved yet: two-step login
 * only turns on once a code from the app proves it was set up right.
 */
export async function startTwoFactorSetup(
  db: Db,
  shopId: string,
  actor: Actor,
): Promise<{ secret: string; uri: string }> {
  adminsOnly(actor);
  const row = await userRow(db, shopId, actor);
  if (row.totp) throw new ApiError(409, 'ALREADY_ON', 'Two-step login is already on.');
  const secret = newTotpSecret();
  return { secret, uri: otpauthUri(APP_NAME, `${row.username}@${row.slug}`, secret) };
}

/** Other devices are logged out: they signed in without the second step. */
function revokeOtherSessions(
  db: Db,
  shopId: string,
  actor: Actor,
  keepSessionId: string,
  now: number,
) {
  return db
    .update(sessions)
    .set({ revokedAt: now })
    .where(
      and(
        eq(sessions.userId, actor.userId),
        eq(sessions.shopId, shopId),
        ne(sessions.id, keepSessionId),
        isNull(sessions.revokedAt),
      ),
    );
}

export async function enableTwoFactor(
  db: Db,
  shopId: string,
  actor: Actor,
  sessionId: string,
  encKey: string,
  input: { secret: string; code: string },
  now: number = Date.now(),
): Promise<void> {
  adminsOnly(actor);
  const row = await userRow(db, shopId, actor);
  if (row.totp) throw new ApiError(409, 'ALREADY_ON', 'Two-step login is already on.');
  if (!(await verifyTotp(input.secret, input.code, now))) {
    throw new ApiError(400, 'INVALID_TOTP', 'That code is not right. Try the newest one.');
  }
  await db.batch([
    db
      .update(users)
      .set({ totpSecretEnc: await encryptSecret(input.secret, encKey) })
      .where(and(eq(users.id, actor.userId), eq(users.shopId, shopId))),
    revokeOtherSessions(db, shopId, actor, sessionId, now),
    auditInsert(
      db,
      shopId,
      {
        action: '2fa.enable',
        userId: actor.userId,
        target: { type: 'user', id: actor.userId },
        ipHash: actor.ipHash,
      },
      now,
    ),
  ]);
}

/** Turning it off needs a current code, so a stolen session alone can't remove it. */
export async function disableTwoFactor(
  db: Db,
  shopId: string,
  actor: Actor,
  encKey: string,
  input: { code: string },
  now: number = Date.now(),
): Promise<void> {
  const row = await userRow(db, shopId, actor);
  if (!row.totp) return;
  const secret = await decryptSecret(row.totp, encKey);
  if (!(await verifyTotp(secret, input.code, now))) {
    throw new ApiError(400, 'INVALID_TOTP', 'That code is not right. Try the newest one.');
  }
  await db.batch([
    db
      .update(users)
      .set({ totpSecretEnc: null })
      .where(and(eq(users.id, actor.userId), eq(users.shopId, shopId))),
    auditInsert(
      db,
      shopId,
      {
        action: '2fa.disable',
        userId: actor.userId,
        target: { type: 'user', id: actor.userId },
        ipHash: actor.ipHash,
      },
      now,
    ),
  ]);
}
