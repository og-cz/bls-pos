import { and, asc, count, eq, inArray, isNull, sql } from 'drizzle-orm';

import { entitlementsFor } from '@shared/entitlements';
import { hasRole, type Role } from '@shared/roles';
import type { AssignableRole, CreateStaffInput, StaffMember } from '@shared/schemas/staff';

import type { Db } from '../db/client';
import { isUniqueViolation } from '../db/errors';
import { newId } from '../db/id';
import { sessions, shops, users } from '../db/schema';
import type { Actor } from '../lib/actor';
import { ApiError } from '../lib/errors';
import { mediaUrl } from '../lib/media';
import { newTemporaryPassword } from '../security/codes';
import { hashPassword } from '../security/password';
import { auditInsert } from './audit';

const memberColumns = {
  id: users.id,
  username: users.username,
  displayName: users.displayName,
  role: users.role,
  active: users.active,
  createdAt: users.createdAt,
  avatarKey: users.avatarKey,
};

/** Everyone in the shop, owner first, then admins, then staff. Never password data. */
export async function listMembers(db: Db, shopId: string): Promise<StaffMember[]> {
  const rows = await db
    .select(memberColumns)
    .from(users)
    .where(eq(users.shopId, shopId))
    .orderBy(
      sql`CASE ${users.role} WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END`,
      asc(users.displayName),
    );
  return rows.map(({ avatarKey, ...m }) => ({
    ...m,
    avatarUrl: avatarKey ? mediaUrl(avatarKey) : null,
  }));
}

/**
 * Who may create whom (Section 1.1): admins add staff; only the owner adds admins.
 * Nobody creates an owner (the schema does not even allow it).
 */
function canCreate(actorRole: Role, role: CreateStaffInput['role']): boolean {
  return role === 'staff' ? hasRole(actorRole, 'admin') : actorRole === 'owner';
}

export type CreatedStaff = { user: StaffMember; temporaryPassword: string };

/** Creates an admin or staff account with a temporary password, shown once. */
export async function createStaff(
  db: Db,
  shopId: string,
  pepper: string,
  actor: Actor,
  input: CreateStaffInput,
  now: number = Date.now(),
): Promise<CreatedStaff> {
  if (!canCreate(actor.role, input.role)) {
    throw new ApiError(403, 'FORBIDDEN', 'Only the owner can add admins.');
  }

  const shop = await db.select({ plan: shops.plan }).from(shops).where(eq(shops.id, shopId)).get();
  if (!shop) throw new ApiError(404, 'NOT_FOUND', 'Shop not found.');

  // Deactivated accounts don't count, so a shop can replace staff who left.
  const { maxStaff } = entitlementsFor(shop.plan);
  const current = await db
    .select({ n: count() })
    .from(users)
    .where(
      and(
        eq(users.shopId, shopId),
        inArray(users.role, ['admin', 'staff']),
        eq(users.active, true),
      ),
    )
    .get();
  if ((current?.n ?? 0) >= maxStaff) {
    throw new ApiError(
      409,
      'STAFF_LIMIT_REACHED',
      `Your plan allows up to ${maxStaff} staff accounts. Deactivate someone who left to add someone new.`,
    );
  }

  const temporaryPassword = newTemporaryPassword();
  const member: StaffMember = {
    id: newId(now),
    username: input.username,
    displayName: input.displayName,
    role: input.role,
    active: true,
    createdAt: now,
    avatarUrl: null,
  };

  try {
    await db.batch([
      db.insert(users).values({
        id: member.id,
        username: member.username,
        displayName: member.displayName,
        role: member.role,
        active: member.active,
        createdAt: member.createdAt,
        shopId,
        passwordHash: await hashPassword(temporaryPassword, pepper),
      }),
      auditInsert(
        db,
        shopId,
        {
          action: 'staff.create',
          userId: actor.userId,
          target: { type: 'user', id: member.id },
          details: { username: member.username, role: member.role },
          ipHash: actor.ipHash,
        },
        now,
      ),
    ]);
  } catch (err) {
    if (isUniqueViolation(err, 'users.shop_id')) {
      throw new ApiError(409, 'USERNAME_TAKEN', 'Someone in this shop already has that username.', {
        username: 'Already taken in this shop.',
      });
    }
    throw err;
  }

  return { user: member, temporaryPassword };
}

/**
 * Who may change whom: the owner manages admins and staff; admins manage staff only.
 * Nobody changes the owner through these routes, and nobody changes their own account.
 */
function canManage(actor: Actor, target: { id: string; role: Role }) {
  if (target.id === actor.userId || target.role === 'owner') return false;
  return target.role === 'staff' ? hasRole(actor.role, 'admin') : actor.role === 'owner';
}

/** Deactivates an account and signs it out everywhere (Section 7.2). Safe to repeat. */
export async function deactivateMember(
  db: Db,
  shopId: string,
  actor: Actor,
  targetId: string,
  now: number = Date.now(),
): Promise<StaffMember> {
  const target = await db
    .select(memberColumns)
    .from(users)
    .where(and(eq(users.id, targetId), eq(users.shopId, shopId)))
    .get();
  // Another shop's user looks exactly like a user that doesn't exist.
  if (!target) throw new ApiError(404, 'NOT_FOUND', 'No such account in this shop.');
  if (!canManage(actor, target)) {
    throw new ApiError(403, 'FORBIDDEN', "You can't deactivate this account.");
  }

  await db.batch([
    db
      .update(users)
      .set({ active: false })
      .where(and(eq(users.id, target.id), eq(users.shopId, shopId))),
    db
      .update(sessions)
      .set({ revokedAt: now })
      .where(
        and(
          eq(sessions.userId, target.id),
          eq(sessions.shopId, shopId),
          isNull(sessions.revokedAt),
        ),
      ),
    auditInsert(
      db,
      shopId,
      {
        action: 'staff.deactivate',
        userId: actor.userId,
        target: { type: 'user', id: target.id },
        details: { username: target.username, wasActive: target.active },
        ipHash: actor.ipHash,
      },
      now,
    ),
  ]);
  const { avatarKey, ...rest } = target;
  return { ...rest, active: false, avatarUrl: avatarKey ? mediaUrl(avatarKey) : null };
}

async function managedTarget(db: Db, shopId: string, actor: Actor, targetId: string) {
  const target = await db
    .select(memberColumns)
    .from(users)
    .where(and(eq(users.id, targetId), eq(users.shopId, shopId)))
    .get();
  if (!target) throw new ApiError(404, 'NOT_FOUND', 'No such account in this shop.');
  if (!canManage(actor, target)) {
    throw new ApiError(403, 'FORBIDDEN', "You can't change this account.");
  }
  return target;
}

const revokeAll = (db: Db, shopId: string, userId: string, now: number) =>
  db
    .update(sessions)
    .set({ revokedAt: now })
    .where(
      and(eq(sessions.userId, userId), eq(sessions.shopId, shopId), isNull(sessions.revokedAt)),
    );

/**
 * A new temporary password for someone who forgot theirs (Section 7.12: staff passwords
 * are reset by an admin). Also unlocks the account and signs it out everywhere. The
 * password is shown once, to the admin, and never stored in clear.
 */
export async function resetMemberPassword(
  db: Db,
  shopId: string,
  pepper: string,
  actor: Actor,
  targetId: string,
  now: number = Date.now(),
): Promise<{ temporaryPassword: string }> {
  const target = await managedTarget(db, shopId, actor, targetId);
  const temporaryPassword = newTemporaryPassword();
  await db.batch([
    db
      .update(users)
      .set({
        passwordHash: await hashPassword(temporaryPassword, pepper),
        failedLogins: 0,
        lockedUntil: null,
      })
      .where(and(eq(users.id, target.id), eq(users.shopId, shopId))),
    revokeAll(db, shopId, target.id, now),
    auditInsert(
      db,
      shopId,
      {
        action: 'staff.password_reset',
        userId: actor.userId,
        target: { type: 'user', id: target.id },
        details: { username: target.username },
        ipHash: actor.ipHash,
      },
      now,
    ),
  ]);
  return { temporaryPassword };
}

/**
 * Makes someone an admin or staff. Only the owner changes admins (canManage), so an admin
 * can't promote anyone to admin. Signs the person out, so the new role applies at once.
 */
export async function changeMemberRole(
  db: Db,
  shopId: string,
  actor: Actor,
  targetId: string,
  role: AssignableRole,
  now: number = Date.now(),
): Promise<void> {
  const target = await managedTarget(db, shopId, actor, targetId);
  if (role === 'admin' && actor.role !== 'owner') {
    throw new ApiError(403, 'FORBIDDEN', 'Only the owner can make someone an admin.');
  }
  if (target.role === role) return;
  await db.batch([
    db
      .update(users)
      .set({ role })
      .where(and(eq(users.id, target.id), eq(users.shopId, shopId))),
    revokeAll(db, shopId, target.id, now),
    auditInsert(
      db,
      shopId,
      {
        action: 'staff.role',
        userId: actor.userId,
        target: { type: 'user', id: target.id },
        details: { username: target.username, from: target.role, to: role },
        ipHash: actor.ipHash,
      },
      now,
    ),
  ]);
}
