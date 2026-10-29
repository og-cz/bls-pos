import { describe, expect, it } from 'vitest';

import {
  hashRecoveryCode,
  newRecoveryCode,
  normalizeRecoveryCode,
} from '../../src/worker/security/recovery-codes';

describe('newRecoveryCode', () => {
  it('makes XXXXX-XXXXX codes without easily confused letters', () => {
    for (let i = 0; i < 200; i++) {
      const code = newRecoveryCode();
      expect(code).toMatch(/^[0-9A-Z]{5}-[0-9A-Z]{5}$/);
      expect(code).not.toMatch(/[ILOU]/);
    }
  });

  it('does not repeat', () => {
    const codes = new Set(Array.from({ length: 1000 }, newRecoveryCode));
    expect(codes.size).toBe(1000);
  });
});

describe('normalizeRecoveryCode', () => {
  it('ignores case, spaces and dashes', () => {
    expect(normalizeRecoveryCode(' ab3de-fg4hj ')).toBe('AB3DEFG4HJ');
    expect(normalizeRecoveryCode('AB3 DE FG4 HJ')).toBe('AB3DEFG4HJ');
  });

  it('reads O as zero and I or L as one', () => {
    expect(normalizeRecoveryCode('o1Il0')).toBe('01110');
  });
});

describe('hashRecoveryCode', () => {
  it('gives the same hash for the same code however it is typed', async () => {
    const code = newRecoveryCode();
    const a = await hashRecoveryCode(code, 'pepper');
    const b = await hashRecoveryCode(` ${code.toLowerCase().replace('-', '')} `, 'pepper');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toBe(a);
  });

  it('depends on the pepper (a stolen database alone is not enough)', async () => {
    const code = newRecoveryCode();
    expect(await hashRecoveryCode(code, 'pepper-a')).not.toBe(
      await hashRecoveryCode(code, 'pepper-b'),
    );
  });
});
