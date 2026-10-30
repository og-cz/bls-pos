import { and, asc, eq, isNull } from 'drizzle-orm';

import type { Storefront } from '@shared/schemas/storefront';
import { parseTheme } from '@shared/theme';

import type { Db } from '../db/client';
import { products, shops } from '../db/schema';
import { shopPrefix, thumbKeyFor } from '../lib/media';

// How many products a public page lists at most.
export const STOREFRONT_PRODUCTS_MAX = 60;

/** Public image addresses go through the shop page, never the private /media route. */
export function publicMediaUrl(slug: string, key: string): string {
  return `/api/v1/public/s/${slug}/media/${key}`;
}

async function enabledShop(db: Db, slug: string) {
  const shop = await db
    .select()
    .from(shops)
    .where(and(eq(shops.slug, slug), isNull(shops.deletedAt)))
    .get();
  return shop?.storefrontEnabled ? shop : null;
}

/**
 * A shop's public page by its code (Section 9), or null when there is no such shop or its
 * page is off; callers answer both the same way, so nobody can probe which codes exist.
 * Lists only active products marked "show on shop page"; prices and availability only if
 * the shop chose to show them; never cost, exact stock, staff or sales.
 */
export async function getStorefront(db: Db, slug: string): Promise<Storefront | null> {
  const shop = await enabledShop(db, slug);
  if (!shop) return null;
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      priceCents: products.priceCents,
      trackStock: products.trackStock,
      stock: products.stock,
      imageKey: products.imageKey,
    })
    .from(products)
    .where(
      and(
        eq(products.shopId, shop.id),
        isNull(products.archivedAt),
        eq(products.showOnStorefront, true),
      ),
    )
    .orderBy(asc(products.name))
    .limit(STOREFRONT_PRODUCTS_MAX);

  let theme;
  try {
    theme = parseTheme(JSON.parse(shop.themeJson));
  } catch {
    theme = parseTheme(null);
  }
  return {
    slug: shop.slug,
    name: shop.name,
    bio: shop.bio,
    businessType: shop.businessType,
    currency: shop.currency,
    logoUrl: shop.logoKey ? publicMediaUrl(slug, shop.logoKey) : null,
    coverUrl: shop.coverKey ? publicMediaUrl(slug, shop.coverKey) : null,
    theme,
    products: rows.map((p) => ({
      id: p.id,
      name: p.name,
      priceCents: shop.storefrontShowPrices ? p.priceCents : null,
      available: shop.storefrontShowStock ? !p.trackStock || p.stock > 0 : null,
      imageUrl: p.imageKey ? publicMediaUrl(slug, p.imageKey) : null,
      thumbUrl: p.imageKey ? publicMediaUrl(slug, thumbKeyFor(p.imageKey)) : null,
    })),
  };
}

/**
 * Whether an image may be shown on the shop's public page: its logo, its cover, or the
 * photo (or thumbnail) of a product that is on the page. Avatars and everything else stay
 * private.
 */
export async function isPublicImage(db: Db, slug: string, key: string): Promise<boolean> {
  const shop = await enabledShop(db, slug);
  if (!shop || key.includes('..') || !key.startsWith(shopPrefix(shop.id))) return false;
  if (key === shop.logoKey || key === shop.coverKey) return true;
  // A thumbnail is public when its photo is.
  const photoKey = key.replace(/\.thumb(\.[a-z0-9]+)$/, '$1');
  const product = await db
    .select({ id: products.id })
    .from(products)
    .where(
      and(
        eq(products.shopId, shop.id),
        eq(products.imageKey, photoKey),
        isNull(products.archivedAt),
        eq(products.showOnStorefront, true),
      ),
    )
    .get();
  return product !== undefined;
}
