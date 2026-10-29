import { readableCode } from './codes';
import { toHex } from './encoding';

export const RECOVERY_CODE_COUNT = 10;

const encoder = new TextEncoder();

/** One code: 10 random characters (50 bits), shown as XXXXX-XXXXX. */
export function newRecoveryCode(): string {
  return readableCode(2, 5);
}

/** Accepts what people actually type: any case, spaces or dashes, and O/I/L for 0/1/1. */
export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
}

/**
 * Codes are random (not chosen by people), so a keyed SHA-256 is enough; the slow
 * password hash is not needed and would burn CPU (see docs/LIMITS.md).
 */
export async function hashRecoveryCode(code: string, pepper: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pepper),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`recovery:${normalizeRecoveryCode(code)}`),
  );
  return toHex(new Uint8Array(sig));
}
