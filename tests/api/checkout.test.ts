import { describe, expect, it } from 'vitest';

import { applyKey, quickCashAmounts } from '../../src/shared/checkout';

describe('quickCashAmounts', () => {
  it('offers exact, the next round amounts and the usual bills that cover the total', () => {
    expect(quickCashAmounts(38_650)).toEqual([38_650, 40_000, 50_000, 100_000]);
    expect(quickCashAmounts(10_000)).toEqual([10_000, 50_000, 100_000]);
    expect(quickCashAmounts(4_500)).toEqual([4_500, 10_000, 50_000, 100_000]);
    expect(quickCashAmounts(250_000)).toEqual([250_000]);
  });
});

describe('applyKey', () => {
  it('types amounts like a calculator', () => {
    let t = '';
    for (const k of ['5', '0', '0']) t = applyKey(t, k);
    expect(t).toBe('500');
    t = applyKey(t, '.');
    t = applyKey(t, '5');
    t = applyKey(t, '0');
    t = applyKey(t, '9'); // only two decimals
    expect(t).toBe('500.50');
    expect(applyKey(t, '⌫')).toBe('500.5');
    expect(applyKey(t, 'C')).toBe('');
    expect(applyKey('', '.')).toBe('0.');
    expect(applyKey('0', '7')).toBe('7');
  });
});
