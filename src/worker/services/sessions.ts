import { and, desc, eq, gt, isNull, ne } from 'drizzle-orm';

import { deviceLabel } from '@shared/device';
import type { Role } from '@shared/roles';

import type { Db } from '../db/client';
import { newId } from '../db/id';
import { sessions, shops, users } from '../db/schema';
import type { Actor } from '../lib/actor';
import { newToken, sha256Hex } from '../security/tokens';
import { auditInsert } from './audit';

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

export type SessionInfo = {
  id: string;
  device: string;
  createdAt: number;
  lastSeenAt: number;
  current: boolean;
};

/** Where this person is signed in right now (Section 7.2), newest activity first. */
export async function listMySessions(
  db: Db,
  shopId: string,
  actor: Actor,
  currentSessionId: string,
  now: number = Date.now(),
): Promise<SessionInfo[]> {
  const rows = await db
    .select({
      id: sessions.id,
      userAgent: sessions.userAgent,
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, actor.userId),
        eq(sessions.shopId, shopId),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now),
      ),
    )
    .orderBy(desc(sessions.lastSeenAt));
  return rows.map((r) => ({
    id: r.id,
    device: deviceLabel(r.userAgent),
    createdAt: r.createdAt,
    lastSeenAt: r.lastSeenAt,
    current: r.id === currentSessionId,
  }));
}

/** Logs out one of this person's own devices. */
export async function revokeMySession(
  db: Db,
  shopId: string,
  actor: Actor,
  sessionId: string,
  now: number = Date.now(),
): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: now })
    .where(
      and(
        eq(sessions.id, sessionId),
        eq(sessions.userId, actor.userId),
        eq(sessions.shopId, shopId),
        isNull(sessions.revokedAt),
      ),
    );
}

/** "Log out all other devices": everything but the one asking. Logged. */
export async function revokeMyOtherSessions(
  db: Db,
  shopId: string,
  actor: Actor,
  currentSessionId: string,
  now: number = Date.now(),
): Promise<void> {
  await db.batch([
    db
      .update(sessions)
      .set({ revokedAt: now })
      .where(
        and(
          eq(sessions.userId, actor.userId),
          eq(sessions.shopId, shopId),
          ne(sessions.id, currentSessionId),
          isNull(sessions.revokedAt),
        ),
      ),
    auditInsert(
      db,
      shopId,
      {
        action: 'sessions.revoke',
        userId: actor.userId,
        target: { type: 'user', id: actor.userId },
        ipHash: actor.ipHash,
      },
      now,
    ),
  ]);
}
