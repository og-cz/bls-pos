import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';

import { entitlementsFor } from '@shared/entitlements';
import { hasRole, type Role } from '@shared/roles';
import type { CreateStaffInput, StaffMember } from '@shared/schemas/staff';

import type { Db } from '../db/client';
import { isUniqueViolation } from '../db/errors';
import { newId } from '../db/id';
import { shops, users } from '../db/schema';
import { ApiError } from '../lib/errors';
import { newTemporaryPassword } from '../security/codes';
import { hashPassword } from '../security/password';

const memberColumns = {
  id: users.id,
  username: users.username,
  displayName: users.displayName,
  role: users.role,
  active: users.active,
  createdAt: users.createdAt,
};

/** Everyone in the shop, owner first, then admins, then staff. Never password data. */
export async function listMembers(db: Db, shopId: string): Promise<StaffMember[]> {
  return db
    .select(memberColumns)
    .from(users)
    .where(eq(users.shopId, shopId))
    .orderBy(
      sql`CASE ${users.role} WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END`,
      asc(users.displayName),
    );
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
  actorRole: Role,
  input: CreateStaffInput,
  now: number = Date.now(),
): Promise<CreatedStaff> {
  if (!canCreate(actorRole, input.role)) {
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
  };

  try {
    await db.insert(users).values({
      ...member,
      shopId,
      passwordHash: await hashPassword(temporaryPassword, pepper),
    });
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
