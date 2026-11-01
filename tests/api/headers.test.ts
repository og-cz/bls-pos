import { describe, expect, it } from 'vitest';

import staticHeaders from '../../public/_headers?raw';
import { api, getWithCookie, signUp } from './helpers';

describe('security headers', () => {
  it('every API answer carries them, errors included', async () => {
    const owner = await signUp();
    for (const res of [
      await api('/health'),
      await api('/nope'),
      await getWithCookie('/me', owner.cookie),
      await api('/me'), // 401
    ]) {
      expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('strict-transport-security')).toContain('max-age=63072000');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
    }
    // Private answers are never stored in shared caches.
    expect((await getWithCookie('/me', owner.cookie)).headers.get('cache-control')).toBe(
      'no-store',
    );
  });

  it('the web app gets the Section 7.6 policy', () => {
    const csp = /Content-Security-Policy: (.+)/.exec(staticHeaders)?.[1] ?? '';
    for (const rule of [
      "default-src 'self'",
      // 'wasm-unsafe-eval' lets the photo compressor (WebAssembly) run; it allows no JS eval.
      "script-src 'self' 'wasm-unsafe-eval' https://challenges.cloudflare.com",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
    ]) {
      expect(csp).toContain(rule);
    }
    expect(csp).not.toMatch(/(?<!wasm-)unsafe-eval|script-src[^;]*unsafe-inline/);
    expect(staticHeaders).toContain('Permissions-Policy: camera=(self)');
  });
});
