import { and, inArray, lt, sql } from 'drizzle-orm';

import type { Db } from '../db/client';
import { loginAttempts } from '../db/schema';

// Section 7.3. Failed logins are counted in fixed 15-minute windows.
export const WINDOW_MS = 15 * 60 * 1000;
// Per account (shop + username), counted whether or not the username exists.
export const MAX_FAILURES_PER_USER = 5;
// Per IP. Higher than per-user because many phones share one carrier IP (CGNAT),
// and one shop's cashiers usually share the shop's Wi-Fi.
export const MAX_FAILURES_PER_IP = 20;

export type AttemptKeys = { user: string; ip: string | null };

/** `kind` keeps login and recovery counters apart; the IP counter is shared. */
export function attemptKeys(
  shopSlug: string,
  username: string,
  ipHash: string | null,
  kind: 'user' | 'recover' = 'user',
): AttemptKeys {
  return { user: `${kind}:${shopSlug}:${username}`, ip: ipHash ? `ip:${ipHash}` : null };
}

function windowStart(now: number): number {
  return Math.floor(now / WINDOW_MS) * WINDOW_MS;
}

function keysOf(keys: AttemptKeys): string[] {
  return keys.ip ? [keys.user, keys.ip] : [keys.user];
}

export async function failureCounts(
  db: Db,
  keys: AttemptKeys,
  now: number = Date.now(),
): Promise<{ user: number; ip: number }> {
  const rows = await db
    .select({ key: loginAttempts.key, count: loginAttempts.count })
    .from(loginAttempts)
    .where(
      and(
        inArray(loginAttempts.key, keysOf(keys)),
        sql`${loginAttempts.windowStart} = ${windowStart(now)}`,
      ),
    );
  const get = (key: string | null) => rows.find((r) => r.key === key)?.count ?? 0;
  return { user: get(keys.user), ip: get(keys.ip) };
}

export function isRateLimited(counts: { user: number; ip: number }): boolean {
  return counts.user >= MAX_FAILURES_PER_USER || counts.ip >= MAX_FAILURES_PER_IP;
}

/** Seconds until the current window ends, for the Retry-After header. */
export function retryAfterSeconds(now: number = Date.now()): number {
  return Math.ceil((windowStart(now) + WINDOW_MS - now) / 1000);
}

export async function recordFailure(
  db: Db,
  keys: AttemptKeys,
  now: number = Date.now(),
): Promise<void> {
  const start = windowStart(now);
  const all = keysOf(keys);
  await db.batch([
    // Old windows are never read again; drop them as we go.
    db
      .delete(loginAttempts)
      .where(and(inArray(loginAttempts.key, all), lt(loginAttempts.windowStart, start))),
    ...all.map((key) =>
      db
        .insert(loginAttempts)
        .values({ key, windowStart: start, count: 1 })
        .onConflictDoUpdate({
          target: [loginAttempts.key, loginAttempts.windowStart],
          set: { count: sql`${loginAttempts.count} + 1` },
        }),
    ),
  ]);
}

/** A successful login clears the account counter (the IP counter stays). */
export async function clearUserFailures(db: Db, keys: AttemptKeys): Promise<void> {
  await db.delete(loginAttempts).where(inArray(loginAttempts.key, [keys.user]));
}
