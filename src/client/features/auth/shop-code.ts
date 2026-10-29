// The last shop code used on this device, so cashiers don't retype it every shift.
// Not a secret (it is also the public page address); tokens never go in localStorage.
const KEY = 'bls:shop-code';

export function rememberShopCode(slug: string) {
  try {
    localStorage.setItem(KEY, slug);
  } catch {
    // Private mode or storage blocked: just don't remember.
  }
}

export function lastShopCode(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}
