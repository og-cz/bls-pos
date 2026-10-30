import { describe, expect, it } from 'vitest';

import { createScanReader, findBySku } from '../../src/shared/scan';

describe('findBySku', () => {
  const products = [
    { id: 'a', sku: 'NGK-CR7' },
    { id: 'b', sku: null },
    { id: 'c', sku: '4800016644207' },
  ];
  it('matches the whole SKU, ignoring case and spaces', () => {
    expect(findBySku(products, ' ngk-cr7 ')?.id).toBe('a');
    expect(findBySku(products, '4800016644207')?.id).toBe('c');
  });
  it('never matches part of a SKU or an empty code', () => {
    expect(findBySku(products, 'NGK')).toBeUndefined();
    expect(findBySku(products, '')).toBeUndefined();
  });
});

describe('createScanReader', () => {
  it('reads fast keys ending in Enter as one scan', () => {
    const read = createScanReader();
    const code = '4800016644207';
    let t = 1000;
    let result: string | null = null;
    for (const ch of code) result = read(ch, (t += 5));
    expect(result).toBeNull();
    expect(read('Enter', t + 5)).toBe(code);
  });

  it('ignores normal typing speed and very short codes', () => {
    const read = createScanReader();
    let t = 0;
    for (const ch of 'abc') read(ch, (t += 300));
    expect(read('Enter', (t += 300))).toBeNull();
    for (const ch of 'ab') read(ch, (t += 5));
    expect(read('Enter', t + 5)).toBeNull();
  });

  it('starts over after a pause', () => {
    const read = createScanReader();
    read('x', 0);
    read('y', 5);
    '12345'.split('').forEach((ch, i) => read(ch, 1000 + i * 5));
    expect(read('Enter', 1030)).toBe('12345');
  });
});
