// Shop codes double as the login "shop code" and the public page URL (/s/:slug).
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/;

// Names that would collide with app routes or look official. Extended in Phase 6.
export const RESERVED_SLUGS = new Set([
  'admin',
  'administrator',
  'api',
  'app',
  'assets',
  'auth',
  'billing',
  'bilis',
  'bilis-pos',
  'bilispos',
  'bls',
  'bls-pos',
  'blspos',
  'dashboard',
  'help',
  'login',
  'logout',
  'me',
  'media',
  'official',
  'root',
  'settings',
  'signup',
  'staff',
  'static',
  'status',
  'support',
  'system',
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
