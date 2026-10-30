import { and, eq } from 'drizzle-orm';

import { entitlementsFor } from '@shared/entitlements';
import { hasRole } from '@shared/roles';

import type { StorageAdapter } from '../adapters/types';
import type { Db } from '../db/client';
import { newId } from '../db/id';
import { products, shops, users } from '../db/schema';
import type { Actor } from '../lib/actor';
import { ApiError } from '../lib/errors';
import { mediaUrl, shopPrefix, thumbKeyFor } from '../lib/media';
import { IMAGE_TYPES, MAX_UPLOAD_BYTES, sniffImageType, type ImageType } from '../security/images';

export const UPLOAD_KINDS = ['logo', 'cover', 'product', 'product-thumb', 'avatar'] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];

export type UploadInput = {
  kind: UploadKind;
  data: ArrayBuffer;
  declaredType: string | undefined;
  productId?: string | undefined;
};

/**
 * Stores an image and points the shop, product or user at it (Section 7.8). The key is
 * generated here (never the uploader's file name). The old image, if any, is removed.
 */
export async function uploadImage(
  db: Db,
  shopId: string,
  storage: StorageAdapter,
  actor: Actor,
  input: UploadInput,
): Promise<{ key: string; url: string }> {
  // Avatars: anyone, for themselves. Shop images and product photos: admins and the owner.
  if (input.kind !== 'avatar' && !hasRole(actor.role, 'admin')) {
    throw new ApiError(403, 'FORBIDDEN', "You don't have permission to do that.");
  }

  const size = input.data.byteLength;
  if (size === 0) throw new ApiError(400, 'EMPTY_FILE', 'The file is empty.');
  if (size > MAX_UPLOAD_BYTES) {
    throw new ApiError(413, 'FILE_TOO_LARGE', 'Images must be 2 MB or smaller.');
  }
  const actual = sniffImageType(input.data);
  if (!actual || actual !== input.declaredType) {
    throw new ApiError(415, 'UNSUPPORTED_IMAGE', 'Use a JPEG, PNG or WebP image.');
  }

  if (input.kind === 'product-thumb') return uploadProductThumb(db, shopId, storage, input, actual);

  // Find what the image belongs to before storing anything.
  let oldKey: string | null;
  if (input.kind === 'product') {
    if (!input.productId) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Which product is this photo for?');
    }
    const product = await db
      .select({ imageKey: products.imageKey })
      .from(products)
      .where(and(eq(products.id, input.productId), eq(products.shopId, shopId)))
      .get();
    if (!product) throw new ApiError(404, 'NOT_FOUND', 'No such product in this shop.');
    oldKey = product.imageKey;
  } else if (input.kind === 'avatar') {
    const user = await db
      .select({ avatarKey: users.avatarKey })
      .from(users)
      .where(and(eq(users.id, actor.userId), eq(users.shopId, shopId)))
      .get();
    oldKey = user?.avatarKey ?? null;
  } else {
    const shop = await db
      .select({ logoKey: shops.logoKey, coverKey: shops.coverKey })
      .from(shops)
      .where(eq(shops.id, shopId))
      .get();
    oldKey = (input.kind === 'logo' ? shop?.logoKey : shop?.coverKey) ?? null;
  }

  await checkImageSpace(db, shopId, storage, size);

  const key = `${shopPrefix(shopId)}${input.kind}/${newId()}.${IMAGE_TYPES[actual]}`;
  await storage.put(key, input.data, actual);

  try {
    if (input.kind === 'product' && input.productId) {
      await db
        .update(products)
        .set({ imageKey: key, updatedAt: Date.now() })
        .where(and(eq(products.id, input.productId), eq(products.shopId, shopId)));
    } else if (input.kind === 'avatar') {
      await db
        .update(users)
        .set({ avatarKey: key })
        .where(and(eq(users.id, actor.userId), eq(users.shopId, shopId)));
    } else {
      await db
        .update(shops)
        .set(input.kind === 'logo' ? { logoKey: key } : { coverKey: key })
        .where(eq(shops.id, shopId));
    }
  } catch (err) {
    await storage.delete(key); // don't leave an orphan behind
    throw err;
  }

  if (oldKey) {
    await storage.delete(oldKey);
    // A replaced product photo takes its thumbnail with it.
    if (input.kind === 'product') await storage.delete(thumbKeyFor(oldKey));
  }
  return { key, url: mediaUrl(key) };
}

async function checkImageSpace(db: Db, shopId: string, storage: StorageAdapter, size: number) {
  const shop = await db.select({ plan: shops.plan }).from(shops).where(eq(shops.id, shopId)).get();
  const limitBytes = entitlementsFor(shop?.plan ?? 'free').maxImagesMB * 1024 * 1024;
  if ((await storage.usedBytes(shopPrefix(shopId))) + size > limitBytes) {
    throw new ApiError(
      409,
      'STORAGE_LIMIT_REACHED',
      'Your shop has used all its image space. Remove photos you no longer need.',
    );
  }
}

// Thumbnails are small by design (about 320 px); anything bigger is a mistake.
export const MAX_THUMB_BYTES = 200 * 1024;

/** Stores the small list-size copy of a product's current photo, next to it. */
async function uploadProductThumb(
  db: Db,
  shopId: string,
  storage: StorageAdapter,
  input: UploadInput,
  type: ImageType,
): Promise<{ key: string; url: string }> {
  if (!input.productId) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Which product is this photo for?');
  }
  if (input.data.byteLength > MAX_THUMB_BYTES) {
    throw new ApiError(413, 'FILE_TOO_LARGE', 'Thumbnails must be 200 KB or smaller.');
  }
  const product = await db
    .select({ imageKey: products.imageKey })
    .from(products)
    .where(and(eq(products.id, input.productId), eq(products.shopId, shopId)))
    .get();
  if (!product) throw new ApiError(404, 'NOT_FOUND', 'No such product in this shop.');
  if (!product.imageKey) {
    throw new ApiError(409, 'NO_PHOTO', 'Upload the product photo before its thumbnail.');
  }
  // Same format as the photo, so the thumbnail key can be derived from the photo's key.
  if (!product.imageKey.endsWith(`.${IMAGE_TYPES[type]}`)) {
    throw new ApiError(415, 'UNSUPPORTED_IMAGE', 'The thumbnail must match the photo format.');
  }
  await checkImageSpace(db, shopId, storage, input.data.byteLength);
  const key = thumbKeyFor(product.imageKey);
  await storage.put(key, input.data, type);
  return { key, url: mediaUrl(key) };
}
