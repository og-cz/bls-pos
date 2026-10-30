// Bulk product import (Phase 3.5): the columns of the template, shared by the browser
// (parsing, preview) and the server (validation, upsert).

export const IMPORT_COLUMNS = [
  'name',
  'sku',
  'category',
  'price',
  'cost',
  'stock',
  'low_stock_threshold',
  'track_stock',
] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

export const REQUIRED_COLUMNS: readonly ImportColumn[] = ['name', 'price'];

/** What each column means, shown on the import screen and in the template's notes. */
export const COLUMN_HELP: Record<ImportColumn, string> = {
  name: 'Product name (required)',
  sku: 'SKU or barcode. Re-importing a row with the same SKU updates that product',
  category: 'Category name; new names are created',
  price: 'Selling price in pesos, e.g. 120 or 120.50 (required)',
  cost: 'What it costs you, in pesos (optional, admins only)',
  stock: 'How many you have now (new products only)',
  low_stock_threshold: 'Alert when stock reaches this number (default 5)',
  track_stock: 'yes or no (default yes). Use no for made-to-order items',
};

export const TEMPLATE_EXAMPLES: Record<ImportColumn, string>[] = [
  {
    name: 'Iced Latte',
    sku: 'LAT-12',
    category: 'Coffee',
    price: '120',
    cost: '45',
    stock: '30',
    low_stock_threshold: '5',
    track_stock: 'yes',
  },
  {
    name: 'Ensaymada',
    sku: '',
    category: 'Pastries',
    price: '45.50',
    cost: '',
    stock: '12',
    low_stock_threshold: '',
    track_stock: '',
  },
];

// Header names people actually use, mapped to template columns.
const ALIASES: Record<string, ImportColumn> = {
  product: 'name',
  product_name: 'name',
  item: 'name',
  item_name: 'name',
  barcode: 'sku',
  code: 'sku',
  item_code: 'sku',
  selling_price: 'price',
  srp: 'price',
  unit_price: 'price',
  unit_cost: 'cost',
  cost_price: 'cost',
  qty: 'stock',
  quantity: 'stock',
  on_hand: 'stock',
  low_stock: 'low_stock_threshold',
  reorder_level: 'low_stock_threshold',
  reorder_point: 'low_stock_threshold',
  track: 'track_stock',
  track_inventory: 'track_stock',
};

/** "Selling Price (₱)" → "price"; unknown headers → null. */
export function matchColumn(header: string): ImportColumn | null {
  const key = header
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if ((IMPORT_COLUMNS as readonly string[]).includes(key)) return key as ImportColumn;
  return ALIASES[key] ?? null;
}

/** Most rows one import takes. Bigger than the Free product limit, so the limit decides. */
export const MAX_IMPORT_ROWS = 10_000;

export type ImportRow = {
  /** Row number as the person sees it in their spreadsheet (header = row 1). */
  line: number;
  values: Record<ImportColumn, string>;
};

export type ParseResult = {
  rows: ImportRow[];
  /** Template columns found in the header row. */
  columns: ImportColumn[];
  /** Headers we didn't recognise; they are ignored. */
  ignored: string[];
  missing: ImportColumn[];
  truncated: boolean;
};

/** A spreadsheet cell as text: numbers and booleans as written, anything else empty. */
function cellText(v: unknown): string {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
    ? String(v).trim()
    : '';
}

/** Turns a grid of cells (first row = headers) into import rows. */
export function rowsFromGrid(grid: readonly (readonly unknown[])[]): ParseResult {
  const [header = [], ...body] = grid;
  const map: (ImportColumn | null)[] = header.map((h) => matchColumn(cellText(h)));
  const columns = [...new Set(map.filter((c): c is ImportColumn => c !== null))];
  const ignored = header
    .map((h, i) => (map[i] === null && cellText(h) ? cellText(h) : null))
    .filter((h): h is string => h !== null);

  const rows: ImportRow[] = [];
  body.forEach((cells, i) => {
    const values = Object.fromEntries(IMPORT_COLUMNS.map((c) => [c, ''])) as Record<
      ImportColumn,
      string
    >;
    cells.forEach((cell, j) => {
      const col = map[j];
      if (col && values[col] === '') values[col] = cellText(cell);
    });
    // Skip rows that are completely empty.
    if (Object.values(values).some((v) => v !== '')) rows.push({ line: i + 2, values });
  });

  return {
    rows: rows.slice(0, MAX_IMPORT_ROWS),
    columns,
    ignored,
    missing: REQUIRED_COLUMNS.filter((c) => !columns.includes(c)),
    truncated: rows.length > MAX_IMPORT_ROWS,
  };
}
