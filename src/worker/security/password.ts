import { fromBase64, toBase64 } from './encoding';

/**
 * Workers caps PBKDF2 at 100,000 iterations (measured in production, see docs/LIMITS.md).
 * Lowering this is safe: stored hashes keep their own count and are re-hashed on login.
 */
export const PBKDF2_ITERATIONS = 100_000;
const MIN_ITERATIONS = 10_000;
const MAX_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

const encoder = new TextEncoder();

// The pepper is a server secret, so a stolen database alone cannot be brute-forced.
// HMAC(pepper, password) is used as the PBKDF2 input.
async function pepperedInput(password: string, pepper: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pepper),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', key, encoder.encode(password));
}

async function derive(
  password: string,
  pepper: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey(
    'raw',
    await pepperedInput(password, pepper),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    HASH_BITS,
  );
  return new Uint8Array(bits);
}

/** Returns `pbkdf2$sha256$<iterations>$<salt b64>$<hash b64>`. */
export async function hashPassword(
  password: string,
  pepper: string,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, pepper, salt, iterations);
  return `pbkdf2$sha256$${iterations}$${toBase64(salt)}$${toBase64(hash)}`;
}

function parse(stored: string) {
  const parts = stored.split('$');
  if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') return null;
  const iterations = Number(parts[2]);
  if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
    return null;
  }
  try {
    const salt = fromBase64(parts[3] ?? '');
    const hash = fromBase64(parts[4] ?? '');
    if (salt.length !== SALT_BYTES || hash.length !== HASH_BITS / 8) return null;
    return { iterations, salt: new Uint8Array(salt), hash };
  } catch {
    return null;
  }
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export type VerifyResult = { ok: boolean; needsRehash: boolean };

/**
 * Checks a password against a stored hash. Malformed hashes fail closed.
 * `needsRehash` is true when the stored iteration count differs from the current setting.
 */
export async function verifyPassword(
  password: string,
  stored: string,
  pepper: string,
): Promise<VerifyResult> {
  const parsed = parse(stored);
  if (!parsed) return { ok: false, needsRehash: false };
  const candidate = await derive(password, pepper, parsed.salt, parsed.iterations);
  const ok = constantTimeEqual(candidate, parsed.hash);
  return { ok, needsRehash: ok && parsed.iterations !== PBKDF2_ITERATIONS };
}
