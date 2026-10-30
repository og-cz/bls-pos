// Two-step login with an authenticator app (Section 7.11): TOTP, RFC 6238 (HMAC-SHA1,
// 30-second steps, 6 digits), with WebCrypto only. The secret is stored encrypted with
// AES-GCM under TOTP_ENC_KEY, a Worker secret that never reaches D1.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_STEP_SECONDS = 30;
const DIGITS = 6;

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET.charAt((value >>> (bits - 5)) & 31);
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET.charAt((value << (5 - bits)) & 31);
  return out;
}

export function base32Decode(text: string): Uint8Array {
  const clean = text.replace(/[\s=-]/g, '').toUpperCase();
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error('Not a base32 secret.');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** A new 160-bit secret, as the base32 text authenticator apps expect. */
export function newTotpSecret(): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

/** The code for one time step. */
export async function totpAt(secret: string, step: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    base32Decode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const counter = new ArrayBuffer(8);
  new DataView(counter).setBigUint64(0, BigInt(step));
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, counter));
  const offset = (mac[mac.length - 1] ?? 0) & 0x0f;
  const binary =
    (((mac[offset] ?? 0) & 0x7f) << 24) |
    ((mac[offset + 1] ?? 0) << 16) |
    ((mac[offset + 2] ?? 0) << 8) |
    (mac[offset + 3] ?? 0);
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True if `code` is right now, or one step before or after (phone clocks drift). */
export async function verifyTotp(secret: string, code: string, now = Date.now()): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  const step = Math.floor(now / 1000 / TOTP_STEP_SECONDS);
  let ok = false;
  for (const s of [step - 1, step, step + 1]) {
    // Check every window, so timing doesn't hint which one matched.
    if (sameText(await totpAt(secret, s), code)) ok = true;
  }
  return ok;
}

/** The link authenticator apps read from the QR code. */
export function otpauthUri(issuer: string, account: string, secret: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=${String(DIGITS)}&period=${String(TOTP_STEP_SECONDS)}`;
}

// ---- Encryption at rest ----

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

function aesKey(encKey: string): Promise<CryptoKey> {
  const raw = unb64(encKey);
  if (raw.length !== 32) throw new Error('TOTP_ENC_KEY must be 32 bytes, base64.');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** "iv.ciphertext", both base64. A fresh IV every time. */
export async function encryptSecret(secret: string, encKey: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await aesKey(encKey),
    new TextEncoder().encode(secret),
  );
  return `${b64(iv)}.${b64(new Uint8Array(data))}`;
}

export async function decryptSecret(stored: string, encKey: string): Promise<string> {
  const [iv = '', data = ''] = stored.split('.');
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(iv) },
    await aesKey(encKey),
    unb64(data),
  );
  return new TextDecoder().decode(plain);
}
