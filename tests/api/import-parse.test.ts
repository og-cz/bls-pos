import { describe, expect, it } from 'vitest';

import { matchColumn, MAX_IMPORT_ROWS, rowsFromGrid } from '../../src/shared/import';

describe('matchColumn', () => {
  it('accepts the template headers in any case or spacing', () => {
    expect(matchColumn('name')).toBe('name');
    expect(matchColumn('  Low Stock Threshold ')).toBe('low_stock_threshold');
    expect(matchColumn('TRACK-STOCK')).toBe('track_stock');
  });

  it('understands common alternative headers', () => {
    expect(matchColumn('Product Name')).toBe('name');
    expect(matchColumn('Selling Price (₱)')).toBe('price');
    expect(matchColumn('Barcode')).toBe('sku');
    expect(matchColumn('Qty')).toBe('stock');
    expect(matchColumn('Reorder level')).toBe('low_stock_threshold');
  });

  it('ignores headers it does not know', () => {
    expect(matchColumn('Supplier')).toBeNull();
    expect(matchColumn('')).toBeNull();
  });
});

describe('rowsFromGrid', () => {
  it('maps cells by header, numbers rows like the spreadsheet, and skips empty rows', () => {
    const result = rowsFromGrid([
      ['Product Name', 'Price', 'Supplier', 'Qty'],
      ['Spark plug', 120, 'ACME', 40],
      ['', '', '', ''],
      ['  Brake pad  ', '850.50', '', ''],
    ]);
    expect(result.columns).toEqual(['name', 'price', 'stock']);
    expect(result.ignored).toEqual(['Supplier']);
    expect(result.missing).toEqual([]);
    expect(result.rows.map((r) => [r.line, r.values.name, r.values.price, r.values.stock])).toEqual(
      [
        [2, 'Spark plug', '120', '40'],
        [4, 'Brake pad', '850.50', ''],
      ],
    );
  });

  it('reports missing required columns', () => {
    expect(rowsFromGrid([['sku', 'stock']]).missing).toEqual(['name', 'price']);
  });

  it('keeps the first of two columns with the same meaning', () => {
    const { rows } = rowsFromGrid([
      ['name', 'price', 'srp'],
      ['Oil filter', '300', '999'],
    ]);
    expect(rows[0]?.values.price).toBe('300');
  });

  it(`stops at ${MAX_IMPORT_ROWS.toLocaleString()} rows and says so`, () => {
    const grid = [
      ['name', 'price'],
      ...Array.from({ length: MAX_IMPORT_ROWS + 5 }, (_, i) => [`P${i}`, '1']),
    ];
    const result = rowsFromGrid(grid);
    expect(result.rows).toHaveLength(MAX_IMPORT_ROWS);
    expect(result.truncated).toBe(true);
  });

  it('never turns objects into "[object Object]"', () => {
    const { rows } = rowsFromGrid([
      ['name', 'price'],
      [{ formula: '=A1' }, '10'],
    ]);
    expect(rows[0]?.values.name).toBe('');
  });
});
