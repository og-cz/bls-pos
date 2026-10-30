import { describe, expect, it } from 'vitest';

import { IMPORT_COLUMNS, type ImportColumn } from '../../src/shared/import';
import { checkRow, checkRows, describeProblems } from '../../src/shared/import-validate';

function values(partial: Partial<Record<ImportColumn, string>>) {
  return {
    ...(Object.fromEntries(IMPORT_COLUMNS.map((c) => [c, ''])) as Record<ImportColumn, string>),
    ...partial,
  };
}

describe('checkRow', () => {
  it('turns a good row into a product, in centavos', () => {
    const check = checkRow(
      values({
        name: ' Spark plug NGK ',
        sku: 'NGK-CR7',
        category: 'Engine',
        price: '1,250.50',
        cost: '₱ 900',
        stock: '1,200',
        low_stock_threshold: '10',
        track_stock: 'Yes',
      }),
    );
    expect(check).toEqual({
      ok: true,
      product: {
        name: 'Spark plug NGK',
        sku: 'NGK-CR7',
        category: 'Engine',
        priceCents: 125_050,
        costCents: 90_000,
        stock: 1_200,
        lowStockThreshold: 10,
        trackStock: true,
      },
    });
  });

  it('leaves empty optional cells as null so the product keeps or defaults them', () => {
    const check = checkRow(values({ name: 'Brake pad', price: '850' }));
    expect(check).toMatchObject({
      ok: true,
      product: { sku: null, category: null, costCents: null, stock: null, trackStock: null },
    });
  });

  it('explains every problem in plain words', () => {
    const check = checkRow(
      values({
        name: '',
        price: '',
        cost: 'abc',
        stock: '-3',
        low_stock_threshold: '2.5',
        sku: 'has space',
        track_stock: 'maybe',
      }),
    );
    expect(check).toEqual({
      ok: false,
      errors: {
        name: 'name is missing',
        sku: 'SKU can only have letters, numbers, dots, dashes, slashes or underscores',
        price: 'price is missing',
        cost: 'cost must be an amount like 120 or 120.50',
        stock: 'stock must be a whole number like 12',
        low_stock_threshold: 'low stock threshold must be a whole number like 12',
        track_stock: 'track_stock must be yes or no',
      },
    });
  });

  it('accepts yes/no in the forms people type, including Tagalog', () => {
    for (const [input, expected] of [
      ['y', true],
      ['TRUE', true],
      ['oo', true],
      ['No', false],
      ['0', false],
      ['hindi', false],
    ] as const) {
      const check = checkRow(values({ name: 'A', price: '1', track_stock: input }));
      expect(check.ok && check.product.trackStock, input).toBe(expected);
    }
  });

  it('refuses huge amounts and control characters', () => {
    expect(checkRow(values({ name: 'A', price: '9999999' })).ok).toBe(false);
    expect(checkRow(values({ name: 'A\u0007', price: '1' })).ok).toBe(false);
    expect(checkRow(values({ name: 'x'.repeat(81), price: '1' })).ok).toBe(false);
  });
});

describe('checkRows', () => {
  it('flags a SKU used twice in the file (any case) on the later row', () => {
    const rows = checkRows([
      { line: 2, values: values({ name: 'A', price: '1', sku: 'ab-1' }) },
      { line: 3, values: values({ name: 'B', price: '1', sku: 'AB-1' }) },
      { line: 4, values: values({ name: 'C', price: '' }) },
    ]);
    expect(rows.map((r) => r.check.ok)).toEqual([true, false, false]);
    expect(rows.map(describeProblems)).toEqual([
      '',
      'Row 3: SKU is also on row 2',
      'Row 4: price is missing',
    ]);
  });

  it('checks 10,000 rows quickly', () => {
    const many = Array.from({ length: 10_000 }, (_, i) => ({
      line: i + 2,
      values: values({ name: `Part ${i}`, sku: `P-${i}`, price: '99.50', stock: '5' }),
    }));
    const start = performance.now();
    const rows = checkRows(many);
    expect(rows.every((r) => r.check.ok)).toBe(true);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
