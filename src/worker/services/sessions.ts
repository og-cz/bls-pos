import { and, eq, isNull } from 'drizzle-orm';

import type { Role } from '@shared/roles';

import type { Db } from '../db/client';
import { newId } from '../db/id';
import { sessions, shops, users } from '../db/schema';
import { newToken, sha256Hex } from '../security/tokens';

// Section 7.2.
export const SESSION_ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;
export const STAFF_IDLE_MS = 12 * 60 * 60 * 1000;
const LAST_SEEN_REFRESH_MS = 5 * 60 * 1000;

export type SessionMeta = { userAgent?: string | null; ipHash?: string | null };

export type AuthContext = {
  sessionId: string;
  userId: string;
  shopId: string;
  role: Role;
  username: string;
  displayName: string;
};

/** Creates a session and returns the raw token for the cookie. Only its hash is stored. */
export async function createSession(
  db: Db,
  shopId: string,
  userId: string,
  meta: SessionMeta,
  now: number = Date.now(),
): Promise<{ token: string; expiresAt: number }> {
  const token = newToken();
  const expiresAt = now + SESSION_ABSOLUTE_MS;
  await db.insert(sessions).values({
    id: newId(now),
    tokenHash: await sha256Hex(token),
    userId,
    shopId,
    userAgent: meta.userAgent?.slice(0, 200) ?? null,
    ipHash: meta.ipHash ?? null,
    createdAt: now,
    lastSeenAt: now,
    expiresAt,
  });
  return { token, expiresAt };
}

/**
 * Resolves a cookie token to a live session. Returns null if the session is unknown,
 * revoked, expired, idle too long (staff), or the user or shop is no longer active.
 */
export async function resolveSession(
  db: Db,
  token: string,
  now: number = Date.now(),
): Promise<AuthContext | null> {
  const row = await db
    .select({
      sessionId: sessions.id,
      sessionShopId: sessions.shopId,
      lastSeenAt: sessions.lastSeenAt,
      expiresAt: sessions.expiresAt,
      revokedAt: sessions.revokedAt,
      userId: users.id,
      userShopId: users.shopId,
      role: users.role,
      username: users.username,
      displayName: users.displayName,
      active: users.active,
      shopDeletedAt: shops.deletedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(shops, eq(shops.id, users.shopId))
    .where(eq(sessions.tokenHash, await sha256Hex(token)))
    .get();

  if (!row) return null;
  if (row.revokedAt !== null || row.expiresAt <= now) return null;
  if (!row.active || row.shopDeletedAt !== null) return null;
  if (row.sessionShopId !== row.userShopId) return null;
  if (row.role === 'staff' && now - row.lastSeenAt > STAFF_IDLE_MS) return null;

  if (now - row.lastSeenAt > LAST_SEEN_REFRESH_MS) {
    await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.sessionId));
  }

  return {
    sessionId: row.sessionId,
    userId: row.userId,
    shopId: row.userShopId,
    role: row.role,
    username: row.username,
    displayName: row.displayName,
  };
}

export async function revokeSession(
  db: Db,
  shopId: string,
  sessionId: string,
  now: number = Date.now(),
): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: now })
    .where(
      and(eq(sessions.id, sessionId), eq(sessions.shopId, shopId), isNull(sessions.revokedAt)),
    );
}

/** Revokes every session of a user, e.g. after a password change or deactivation. */
export async function revokeUserSessions(
  db: Db,
  shopId: string,
  userId: string,
  now: number = Date.now(),
): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: now })
    .where(
      and(eq(sessions.userId, userId), eq(sessions.shopId, shopId), isNull(sessions.revokedAt)),
    );
}
