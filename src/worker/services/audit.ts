import { and, desc, eq, lt } from 'drizzle-orm';

import type { AuditAction, AuditEntry } from '@shared/audit';

import type { Db } from '../db/client';
import { newId } from '../db/id';
import { auditLog, users } from '../db/schema';

export type AuditInput = {
  action: AuditAction;
  userId?: string | null;
  target?: { type: string; id: string };
  details?: Record<string, unknown>;
  ipHash?: string | null;
};

// Defence in depth: even if a caller slips, these never reach the log (Section 7.13).
const SECRET_KEY = /pass|token|secret|hash|code|totp|pepper|cookie/i;

function scrub(details: Record<string, unknown> | undefined): string | null {
  if (!details) return null;
  const safe = Object.fromEntries(Object.entries(details).filter(([k]) => !SECRET_KEY.test(k)));
  return JSON.stringify(safe);
}

/**
 * The insert for one audit entry, unexecuted, so it can join the same `db.batch()` as
 * the change it describes: the change and its log line succeed or fail together.
 */
export function auditInsert(db: Db, shopId: string, input: AuditInput, now: number = Date.now()) {
  return db.insert(auditLog).values({
    id: newId(now),
    shopId,
    userId: input.userId ?? null,
    action: input.action,
    targetType: input.target?.type ?? null,
    targetId: input.target?.id ?? null,
    detailsJson: scrub(input.details),
    ipHash: input.ipHash ?? null,
    createdAt: now,
  });
}

/** The same entry as {@link auditInsert}, as a raw D1 statement for raw D1 batches. */
export function auditStatement(
  db: Db,
  shopId: string,
  input: AuditInput,
  now: number = Date.now(),
): D1PreparedStatement {
  return db.$client
    .prepare(
      `INSERT INTO audit_log (id, shop_id, user_id, action, target_type, target_id, details_json, ip_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      newId(now),
      shopId,
      input.userId ?? null,
      input.action,
      input.target?.type ?? null,
      input.target?.id ?? null,
      scrub(input.details),
      input.ipHash ?? null,
      now,
    );
}

/** Writes one entry on its own, for events with no other write (e.g. a failed login). */
export async function writeAudit(
  db: Db,
  shopId: string,
  input: AuditInput,
  now: number = Date.now(),
): Promise<void> {
  await auditInsert(db, shopId, input, now);
}

export const AUDIT_PAGE_MAX = 100;

/** Newest first. `cursor` is the last id of the previous page. */
export async function listAudit(
  db: Db,
  shopId: string,
  { cursor, limit = 50 }: { cursor?: string | undefined; limit?: number },
): Promise<{ entries: AuditEntry[]; nextCursor: string | null }> {
  const size = Math.min(Math.max(limit, 1), AUDIT_PAGE_MAX);
  const rows = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      userId: auditLog.userId,
      displayName: users.displayName,
      targetType: auditLog.targetType,
      targetId: auditLog.targetId,
      detailsJson: auditLog.detailsJson,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    // Joined on shop too, so an entry can never show another shop's user.
    .leftJoin(users, and(eq(users.id, auditLog.userId), eq(users.shopId, auditLog.shopId)))
    .where(and(eq(auditLog.shopId, shopId), cursor ? lt(auditLog.id, cursor) : undefined))
    .orderBy(desc(auditLog.id))
    .limit(size + 1);

  const page = rows.slice(0, size);
  return {
    entries: page.map((r) => ({
      id: r.id,
      action: r.action as AuditAction,
      user: r.userId ? { id: r.userId, displayName: r.displayName ?? 'Removed user' } : null,
      targetType: r.targetType,
      targetId: r.targetId,
      details: r.detailsJson ? (JSON.parse(r.detailsJson) as Record<string, unknown>) : null,
      createdAt: r.createdAt,
    })),
    nextCursor: rows.length > size ? (page.at(-1)?.id ?? null) : null,
  };
}
