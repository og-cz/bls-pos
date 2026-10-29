import { describe, expect, it } from 'vitest';

import { newTemporaryPassword, readableCode } from '../../src/worker/security/codes';

describe('readable codes', () => {
  it('builds dash-separated groups without confusable letters', () => {
    for (let i = 0; i < 200; i++) {
      const code = readableCode(3, 4);
      expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
      expect(code).not.toMatch(/[ILOU]/);
    }
  });

  it('makes unique temporary passwords long enough for any role', () => {
    const passwords = new Set(Array.from({ length: 500 }, newTemporaryPassword));
    expect(passwords.size).toBe(500);
    for (const p of passwords) expect(p.length).toBeGreaterThanOrEqual(10);
  });
});
