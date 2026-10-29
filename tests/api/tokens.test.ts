import { describe, expect, it } from 'vitest';

import { hashIp, newToken, sha256Hex } from '../../src/worker/security/tokens';

describe('newToken', () => {
  it('is 32 random bytes in base64url', () => {
    const tokens = new Set(Array.from({ length: 500 }, newToken));
    expect(tokens.size).toBe(500);
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('sha256Hex', () => {
  it('matches a known SHA-256 value', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('hashIp', () => {
  it('never contains the address and depends on the pepper', async () => {
    const ip = '203.0.113.7';
    const a = await hashIp(ip, 'pepper-a');
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toContain(ip);
    expect(await hashIp(ip, 'pepper-a')).toBe(a);
    expect(await hashIp(ip, 'pepper-b')).not.toBe(a);
    expect(await hashIp('203.0.113.8', 'pepper-a')).not.toBe(a);
  });
});
