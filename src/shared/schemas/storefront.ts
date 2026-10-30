import type { BusinessType } from '../business';
import type { Theme } from '../theme';

/** One product on a public shop page. Never cost, never the exact stock count. */
export type StorefrontProduct = {
  id: string;
  name: string;
  /** Only when the shop shows prices. */
  priceCents: number | null;
  /** Only when the shop shows stock: whether it can be bought now. */
  available: boolean | null;
  imageUrl: string | null;
  thumbUrl: string | null;
};

/** Everything a public shop page shows (Section 9). Nothing internal. */
export type Storefront = {
  slug: string;
  name: string;
  bio: string | null;
  businessType: BusinessType;
  currency: string;
  logoUrl: string | null;
  coverUrl: string | null;
  theme: Theme;
  products: StorefrontProduct[];
};
