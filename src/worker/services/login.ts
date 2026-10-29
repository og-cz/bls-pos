import { and, eq, isNull } from 'drizzle-orm';

import type { LoginInput } from '@shared/schemas/auth';
import type { Role } from '@shared/roles';

import type { Db } from '../db/client';
import { shops, users } from '../db/schema';
import { ApiError } from '../lib/errors';
import { hashPassword, verifyPassword } from '../security/password';

export type LoginResult = { userId: string; shopId: string; role: Role };

// Same message for an unknown shop, unknown user, wrong password or inactive account
// (Section 7.3), so the response never reveals which part was wrong.
export const INVALID_CREDENTIALS = () =>
  new ApiError(401, 'INVALID_CREDENTIALS', 'Shop code, username or password is incorrect.');

// When the user does not exist we still run a full hash, so response time does not
// reveal whether a username exists.
let dummyHash: Promise<string> | undefined;
function getDummyHash(pepper: string): Promise<string> {
  dummyHash ??= hashPassword('dummy password for timing only', pepper);
  return dummyHash;
}

export async function login(db: Db, pepper: string, input: LoginInput): Promise<LoginResult> {
  const user = await db
    .select({
      id: users.id,
      shopId: users.shopId,
      role: users.role,
      passwordHash: users.passwordHash,
      active: users.active,
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

  const stored = user?.passwordHash ?? (await getDummyHash(pepper));
  const { ok, needsRehash } = await verifyPassword(input.password, stored, pepper);
  if (!user || !ok || !user.active) throw INVALID_CREDENTIALS();

  if (needsRehash) {
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(input.password, pepper) })
      .where(and(eq(users.id, user.id), eq(users.shopId, user.shopId)));
  }

  return { userId: user.id, shopId: user.shopId, role: user.role };
}
