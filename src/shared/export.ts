// Spreadsheet export (Phase 3.5). Files are built in the browser from the paged API, so a
// large export never hits the free plan's 10 ms server CPU limit.

export const EXPORT_KINDS = ['products', 'stock', 'movements', 'backup', 'sales'] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];
export const EXPORT_FORMATS = ['csv', 'xlsx', 'json'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export type Cell = string | number | null;

/**
 * Formula-injection protection (Section 7.9): text that a spreadsheet would run as a
 * formula (starting with = + - @, tab or carriage return) gets a leading apostrophe.
 * Numbers stay numbers, so a stock change of -3 is still a number.
 */
export function safeCell(value: Cell): Cell {
  if (typeof value !== 'string') return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function safeRows(rows: readonly (readonly Cell[])[]): Cell[][] {
  return rows.map((r) => r.map(safeCell));
}

/** "aling-nenas-cafe-products-2026-10-30.csv" */
export function exportFileName(
  shopSlug: string,
  kind: ExportKind,
  format: ExportFormat,
  now = new Date(),
): string {
  return `${shopSlug}-${kind}-${now.toISOString().slice(0, 10)}.${format}`;
}
