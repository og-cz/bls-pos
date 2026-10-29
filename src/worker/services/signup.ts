import { defaultTheme } from '@shared/business';
import type { SignupInput } from '@shared/schemas/auth';

import type { Db } from '../db/client';
import { newId } from '../db/id';
import { shops, users } from '../db/schema';
import { ApiError } from '../lib/errors';
import { hashPassword } from '../security/password';

export type SignupResult = {
  shop: { id: string; slug: string; name: string };
  user: { id: string; username: string; displayName: string; role: 'owner' };
};

function isUniqueViolation(err: unknown, column: string): boolean {
  const text = String(err instanceof Error && err.cause ? err.cause : err);
  return text.includes('UNIQUE constraint failed') && text.includes(column);
}

/**
 * Creates a shop and its owner together. Signup is the one operation without a shopId
 * argument: the shop does not exist yet.
 */
export async function createShopWithOwner(
  db: Db,
  pepper: string,
  input: SignupInput,
  now: number = Date.now(),
): Promise<SignupResult> {
  const shopId = newId(now);
  const userId = newId(now);
  const passwordHash = await hashPassword(input.password, pepper);

  try {
    // One batch = one transaction: never a shop without an owner, or the reverse.
    await db.batch([
      db.insert(shops).values({
        id: shopId,
        slug: input.shopSlug,
        name: input.shopName,
        businessType: input.businessType,
        themeJson: JSON.stringify(defaultTheme(input.businessType)),
        createdAt: now,
      }),
      db.insert(users).values({
        id: userId,
        shopId,
        username: input.username,
        displayName: input.ownerName,
        role: 'owner',
        passwordHash,
        createdAt: now,
      }),
    ]);
  } catch (err) {
    if (isUniqueViolation(err, 'shops.slug')) {
      throw new ApiError(409, 'SLUG_TAKEN', 'That shop code is already taken. Try another one.', {
        shopSlug: 'Already taken.',
      });
    }
    throw err;
  }

  return {
    shop: { id: shopId, slug: input.shopSlug, name: input.shopName },
    user: { id: userId, username: input.username, displayName: input.ownerName, role: 'owner' },
  };
}
