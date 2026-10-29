import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';

// Sent as `__Host-bls_session`: HttpOnly, Secure, SameSite=Lax, Path=/ (Section 7.2).
const NAME = 'bls_session';

export function readSessionCookie(c: Context): string | undefined {
  return getCookie(c, NAME, 'host');
}

export function writeSessionCookie(c: Context, token: string, expiresAt: number): void {
  setCookie(c, NAME, token, {
    prefix: 'host',
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    expires: new Date(expiresAt),
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, NAME, { prefix: 'host', path: '/', secure: true });
}
