import { toHex } from './encoding';

const encoder = new TextEncoder();

/** 32 random bytes, base64url. Used as the session cookie value; never stored as-is. */
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256Hex(value: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}

/** Keyed hash for IPs so the database holds no raw addresses (RA 10173: minimum data). */
export async function hashIp(ip: string, pepper: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pepper),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(`ip:${ip}`));
  return toHex(new Uint8Array(sig)).slice(0, 32);
}
