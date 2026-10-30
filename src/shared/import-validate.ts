// Row checks for bulk import (Phase 3.5). The browser runs them to show problems before
// anything is sent; the server runs the same checks again before saving.
import type { ImportColumn, ImportRow } from './import';
import { parseAmountToCents } from './money';
import { MAX_PRICE_CENTS, MAX_STOCK } from './schemas/products';

/** One product, ready to save. Fields left empty in the file are null (keep or default). */
export type ImportProduct = {
  name: string;
  sku: string | null;
  category: string | null;
  priceCents: number;
  costCents: number | null;
  stock: number | null;
  lowStockThreshold: number | null;
  trackStock: boolean | null;
};

export type RowCheck =
  | { ok: true; product: ImportProduct }
  | { ok: false; errors: Partial<Record<ImportColumn, string>> };

const SKU_PATTERN = /^[A-Za-z0-9._\-/]+$/;
const CONTROL = /\p{Cc}/u;
const YES = new Set(['yes', 'y', 'true', '1', 'oo']);
const NO = new Set(['no', 'n', 'false', '0', 'hindi']);

function amount(value: string, label: string, required: boolean) {
  if (value === '') return required ? { error: `${label} is missing` } : { cents: null };
  const cents = parseAmountToCents(value);
  if (cents === null) return { error: `${label} must be an amount like 120 or 120.50` };
  if (cents > MAX_PRICE_CENTS) return { error: `${label} is too large` };
  return { cents };
}

function wholeNumber(value: string, label: string) {
  if (value === '') return { n: null };
  const clean = value.replace(/,/g, '');
  if (!/^\d+$/.test(clean)) return { error: `${label} must be a whole number like 12` };
  const n = Number(clean);
  if (n > MAX_STOCK) return { error: `${label} is too large` };
  return { n };
}

function text(value: string, label: string, max: number) {
  if (value.length > max) return { error: `${label} is longer than ${max} characters` };
  if (CONTROL.test(value)) return { error: `${label} has characters that aren't allowed` };
  return { value };
}

/** Checks one row. Messages read naturally after "Row 214: ". */
export function checkRow(values: Record<ImportColumn, string>): RowCheck {
  const errors: Partial<Record<ImportColumn, string>> = {};
  const v = Object.fromEntries(Object.entries(values).map(([k, val]) => [k, val.trim()])) as Record<
    ImportColumn,
    string
  >;

  if (v.name === '') errors.name = 'name is missing';
  const name = text(v.name, 'name', 80);
  if ('error' in name) errors.name = name.error;

  let sku: string | null = null;
  if (v.sku !== '') {
    if (v.sku.length > 40) errors.sku = 'SKU is longer than 40 characters';
    else if (!SKU_PATTERN.test(v.sku)) {
      errors.sku = 'SKU can only have letters, numbers, dots, dashes, slashes or underscores';
    } else sku = v.sku;
  }

  const category = text(v.category, 'category', 40);
  if ('error' in category) errors.category = category.error;

  const price = amount(v.price, 'price', true);
  if ('error' in price) errors.price = price.error;
  const cost = amount(v.cost, 'cost', false);
  if ('error' in cost) errors.cost = cost.error;

  const stock = wholeNumber(v.stock, 'stock');
  if ('error' in stock) errors.stock = stock.error;
  const low = wholeNumber(v.low_stock_threshold, 'low stock threshold');
  if ('error' in low) errors.low_stock_threshold = low.error;

  let trackStock: boolean | null = null;
  const track = v.track_stock.toLowerCase();
  if (track !== '') {
    if (YES.has(track)) trackStock = true;
    else if (NO.has(track)) trackStock = false;
    else errors.track_stock = 'track_stock must be yes or no';
  }

  if (Object.keys(errors).length > 0 || 'error' in price) return { ok: false, errors };
  return {
    ok: true,
    product: {
      name: v.name,
      sku,
      category: v.category === '' ? null : v.category,
      priceCents: price.cents ?? 0,
      costCents: 'cents' in cost ? cost.cents : null,
      stock: 'n' in stock ? stock.n : null,
      lowStockThreshold: 'n' in low ? low.n : null,
      trackStock,
    },
  };
}

export type CheckedRow = ImportRow & { check: RowCheck };

/**
 * Checks every row, plus what one row can't see on its own: the same SKU twice in the
 * file (the later rows are flagged, since one SKU is one product).
 */
export function checkRows(rows: readonly ImportRow[]): CheckedRow[] {
  const firstLineOfSku = new Map<string, number>();
  return rows.map((row) => {
    const check = checkRow(row.values);
    const sku = row.values.sku.trim().toUpperCase();
    if (sku) {
      const first = firstLineOfSku.get(sku);
      if (first === undefined) firstLineOfSku.set(sku, row.line);
      else {
        const errors = check.ok ? {} : check.errors;
        return {
          ...row,
          check: { ok: false, errors: { ...errors, sku: `SKU is also on row ${first}` } },
        };
      }
    }
    return { ...row, check };
  });
}

/** "Row 214: price is missing; cost must be an amount like 120 or 120.50" */
export function describeProblems(row: CheckedRow): string {
  if (row.check.ok) return '';
  return `Row ${row.line}: ${Object.values(row.check.errors).join('; ')}`;
}
