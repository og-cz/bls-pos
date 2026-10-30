// Shop codes double as the login "shop code" and the public page URL (/s/:slug).
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/;

// Names that would collide with app routes or pages, or look official or like a payment
// service (so nobody's public page can pass as one).
export const RESERVED_SLUGS = new Set([
  'about',
  'account',
  'activity',
  'admin',
  'administrator',
  'api',
  'app',
  'assets',
  'auth',
  'bilis',
  'bilis-pos',
  'bilispos',
  'billing',
  'bir',
  'bls',
  'bls-pos',
  'blspos',
  'branding',
  'cart',
  'cdn',
  'checkout',
  'contact',
  'dashboard',
  'docs',
  'download',
  'email',
  'gcash',
  'gov',
  'government',
  'help',
  'help-center',
  'inventory',
  'login',
  'logout',
  'mail',
  'maya',
  'me',
  'media',
  'news',
  'official',
  'police',
  'pos',
  'pricing',
  'privacy',
  'products',
  'profile',
  'public',
  'recover',
  'register',
  'reports',
  'root',
  's',
  'sales',
  'security',
  'sell',
  'settings',
  'shop',
  'shops',
  'signup',
  'staff',
  'static',
  'status',
  'store',
  'storefront',
  'support',
  'system',
  'terms',
  'upload',
  'uploads',
  'verify',
  'www',
]);

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug) && !slug.includes('--') && !RESERVED_SLUGS.has(slug);
}

/** Suggests a shop code from a shop name: "Aling Nena's Café" → "aling-nenas-cafe". */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}
