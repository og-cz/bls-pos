import { describe, expect, it } from 'vitest';

import { matchPhotosToSkus, skuFromFileName } from '../../src/shared/import';

describe('skuFromFileName', () => {
  it('drops the extension and copy suffixes', () => {
    expect(skuFromFileName('NGK-CR7.jpg')).toBe('NGK-CR7');
    expect(skuFromFileName('ngk-cr7.JPEG')).toBe('ngk-cr7');
    expect(skuFromFileName('BP-1 (2).png')).toBe('BP-1');
    expect(skuFromFileName('part.v2.webp')).toBe('part.v2');
  });
});

describe('matchPhotosToSkus', () => {
  it('matches by SKU ignoring case, and reports the rest', () => {
    const products = [
      { id: 'p1', sku: 'NGK-CR7' },
      { id: 'p2', sku: 'BP-1' },
      { id: 'p3', sku: null },
    ];
    const files = [
      { name: 'ngk-cr7.jpg' },
      { name: 'BP-1.png' },
      { name: 'unknown.jpg' },
      { name: 'BP-1 (1).jpg' },
    ];
    const { matched, unmatched, duplicates } = matchPhotosToSkus(files, products);
    expect(matched.map((m) => [m.file.name, m.productId])).toEqual([
      ['ngk-cr7.jpg', 'p1'],
      ['BP-1.png', 'p2'],
    ]);
    expect(unmatched.map((m) => m.sku)).toEqual(['unknown']);
    expect(duplicates.map((f) => f.name)).toEqual(['BP-1 (1).jpg']);
  });
});
