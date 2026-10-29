import { describe, expect, it } from 'vitest';

import { checkPassword } from '@shared/password-policy';
import {
  hashPassword,
  PBKDF2_ITERATIONS,
  verifyPassword,
} from '../../src/worker/security/password';

const PEPPER = 'test-pepper';

describe('hashPassword / verifyPassword', () => {
  it('stores algorithm, iteration count, salt and hash', async () => {
    const stored = await hashPassword('correct horse battery', PEPPER);
    expect(stored).toMatch(/^pbkdf2\$sha256\$100000\$[A-Za-z0-9+/=]{24}\$[A-Za-z0-9+/=]{44}$/);
    expect(PBKDF2_ITERATIONS).toBe(100_000);
  });

  it('accepts the right password and rejects a wrong one', async () => {
    const stored = await hashPassword('correct horse battery', PEPPER);
    expect(await verifyPassword('correct horse battery', stored, PEPPER)).toEqual({
      ok: true,
      needsRehash: false,
    });
    expect((await verifyPassword('correct horse batterz', stored, PEPPER)).ok).toBe(false);
  });

  it('uses a fresh salt every time', async () => {
    const a = await hashPassword('same password here', PEPPER);
    const b = await hashPassword('same password here', PEPPER);
    expect(a).not.toBe(b);
  });

  it('fails without the right pepper (stolen database alone is not enough)', async () => {
    const stored = await hashPassword('correct horse battery', PEPPER);
    expect((await verifyPassword('correct horse battery', stored, 'other-pepper')).ok).toBe(false);
  });

  it('flags hashes made with a different iteration count for re-hashing', async () => {
    const old = await hashPassword('correct horse battery', PEPPER, 50_000);
    expect(await verifyPassword('correct horse battery', old, PEPPER)).toEqual({
      ok: true,
      needsRehash: true,
    });
    // A wrong password never asks for a re-hash.
    expect(await verifyPassword('wrong password!!', old, PEPPER)).toEqual({
      ok: false,
      needsRehash: false,
    });
  });

  it('fails closed on malformed or tampered hashes', async () => {
    const stored = await hashPassword('correct horse battery', PEPPER);
    const parts = stored.split('$');
    const cases = [
      '',
      'not-a-hash',
      stored.replace('pbkdf2', 'bcrypt'),
      stored.replace('$100000$', '$1$'), // iteration downgrade attack
      stored.replace('$100000$', '$100001$'), // above the Workers cap
      [...parts.slice(0, 3), '!!!', parts[4]].join('$'),
      [...parts.slice(0, 4), 'AAAA'].join('$'),
    ];
    for (const bad of cases) {
      expect(await verifyPassword('correct horse battery', bad, PEPPER)).toEqual({
        ok: false,
        needsRehash: false,
      });
    }
  });
});

describe('checkPassword', () => {
  it('needs 10 characters for owners and admins, 8 for staff', () => {
    expect(checkPassword('short pw!', 'owner')).toBe('too_short');
    expect(checkPassword('short pw!', 'admin')).toBe('too_short');
    expect(checkPassword('short pw!', 'staff')).toBeNull();
    expect(checkPassword('long enough pw', 'owner')).toBeNull();
  });

  it('rejects common and repeated passwords', () => {
    expect(checkPassword('Password123', 'owner')).toBe('too_common');
    expect(checkPassword('12345678', 'staff')).toBe('too_common');
    expect(checkPassword('aaaaaaaaaaaa', 'owner')).toBe('too_common');
  });

  it('caps length', () => {
    expect(checkPassword('x'.repeat(129) + 'y', 'owner')).toBe('too_long');
  });
});
