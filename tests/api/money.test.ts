import { describe, expect, it } from 'vitest';

import { centsToInput, formatCents, parseAmountToCents } from '../../src/shared/money';

describe('money helpers', () => {
  it('formats centavos as pesos', () => {
    expect(formatCents(125_000)).toBe('₱1,250.00');
    expect(formatCents(5)).toBe('₱0.05');
    expect(formatCents(0)).toBe('₱0.00');
  });

  it('parses typed amounts into whole centavos without float errors', () => {
    expect(parseAmountToCents('1,250.5')).toBe(125_050);
    expect(parseAmountToCents('₱ 99')).toBe(9_900);
    expect(parseAmountToCents('0.1')).toBe(10);
    expect(parseAmountToCents('19.99')).toBe(1_999); // 19.99 * 100 is 1998.999… in floats
    expect(parseAmountToCents('12.')).toBe(1_200);
  });

  it('refuses things that are not amounts', () => {
    for (const bad of ['', 'abc', '-5', '1.234', '1e5', '1.2.3']) {
      expect(parseAmountToCents(bad), bad).toBeNull();
    }
  });

  it('round-trips through the input format', () => {
    expect(parseAmountToCents(centsToInput(125_050))).toBe(125_050);
  });
});
