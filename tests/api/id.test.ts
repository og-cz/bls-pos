import { describe, expect, it } from 'vitest';

import { newId } from '../../src/worker/db/id';

describe('newId', () => {
  it('produces RFC 9562 UUIDv7 strings', () => {
    expect(newId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('sorts by creation time', () => {
    const a = newId(1_700_000_000_000);
    const b = newId(1_700_000_000_001);
    expect(a < b).toBe(true);
  });

  it('does not repeat', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId(0)));
    expect(ids.size).toBe(1000);
  });
});
