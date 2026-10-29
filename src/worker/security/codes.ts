// Crockford-style alphabet: no I, L, O or U, so codes survive being read aloud or
// written down by hand. 32 symbols = exactly 5 bits per character, no modulo bias.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** `groups` groups of `size` random characters joined by dashes, e.g. 7K3Q-M9XA. */
export function readableCode(groups: number, size: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(groups * size));
  const chars = Array.from(bytes, (b) => ALPHABET[b & 31]).join('');
  return Array.from({ length: groups }, (_, i) => chars.slice(i * size, (i + 1) * size)).join('-');
}

/**
 * A temporary password an admin reads out or writes down for new staff: 12 characters
 * (60 bits) as XXXX-XXXX-XXXX. Long enough for every role's minimum length.
 */
export function newTemporaryPassword(): string {
  return readableCode(3, 4);
}
