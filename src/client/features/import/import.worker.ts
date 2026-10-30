/// <reference lib="webworker" />
// Parses CSV and Excel files off the main thread (Phase 3.5), so the page never freezes
// on a big catalog. SheetJS lives only in this worker's bundle, not in the app's.
import Papa from 'papaparse';
import { read, utils, write } from 'xlsx';

import {
  COLUMN_HELP,
  IMPORT_COLUMNS,
  rowsFromGrid,
  TEMPLATE_EXAMPLES,
  type ParseResult,
} from '@shared/import';
import { safeRows, type Cell, type ExportFormat } from '@shared/export';

export type WorkerRequest =
  | { type: 'parse-file'; file: File }
  | { type: 'parse-text'; text: string }
  | { type: 'template'; format: 'csv' | 'xlsx' }
  | { type: 'export'; format: ExportFormat; rows: Cell[][]; sheet: string; filename: string };

export type WorkerResponse =
  | { type: 'parsed'; result: ParseResult }
  | { type: 'template'; blob: Blob; filename: string }
  | { type: 'error'; message: string };

// 10 MB of spreadsheet is far more than 10,000 products.
const MAX_FILE_BYTES = 10 * 1024 * 1024;

// Byte order mark: Excel writes it at the start of CSV files, and needs it to read UTF-8.
const BOM = String.fromCharCode(0xfeff);

function parseCsv(text: string): ParseResult {
  // Papa detects commas, semicolons and tabs (rows pasted from Google Sheets are tabs).
  const clean = text.startsWith(BOM) ? text.slice(1) : text;
  const parsed = Papa.parse<string[]>(clean, { skipEmptyLines: 'greedy' });
  return rowsFromGrid(parsed.data);
}

async function parseFile(file: File): Promise<ParseResult> {
  if (file.size > MAX_FILE_BYTES)
    throw new Error('That file is over 10 MB. Split it into smaller files.');
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.ods')) {
    // Cell values as shown (raw: false), so "45.50" stays "45.50" and dates stay readable.
    const book = read(await file.arrayBuffer(), { type: 'array', dense: true });
    const first = book.SheetNames[0];
    const sheet = first ? book.Sheets[first] : undefined;
    if (!sheet) throw new Error('That workbook has no sheets.');
    return rowsFromGrid(
      utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' }),
    );
  }
  if (
    name.endsWith('.csv') ||
    name.endsWith('.tsv') ||
    name.endsWith('.txt') ||
    file.type.startsWith('text/')
  ) {
    return parseCsv(await file.text());
  }
  throw new Error('Use a .csv or .xlsx file, or paste rows from a spreadsheet.');
}

/** CSV (with BOM, for Excel) or .xlsx, always through the formula-injection guard. */
function exportFile(format: ExportFormat, rows: Cell[][], sheet: string, filename: string) {
  const safe = safeRows(rows);
  if (format === 'csv') {
    return { blob: new Blob([BOM, Papa.unparse(safe)], { type: 'text/csv' }), filename };
  }
  const book = utils.book_new();
  utils.book_append_sheet(book, utils.aoa_to_sheet(safe), sheet);
  const data = write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return {
    blob: new Blob([data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename,
  };
}

function template(format: 'csv' | 'xlsx'): { blob: Blob; filename: string } {
  const header = [...IMPORT_COLUMNS];
  const examples = TEMPLATE_EXAMPLES.map((row) => IMPORT_COLUMNS.map((c) => row[c]));
  if (format === 'csv') {
    const csv = Papa.unparse([header, ...examples]);
    // BOM so Excel opens ₱ and accents correctly.
    return { blob: new Blob([BOM, csv], { type: 'text/csv' }), filename: 'bls-pos-products.csv' };
  }
  const book = utils.book_new();
  utils.book_append_sheet(book, utils.aoa_to_sheet([header, ...examples]), 'Products');
  utils.book_append_sheet(
    book,
    utils.aoa_to_sheet([
      ['Column', 'What to put in it'],
      ...IMPORT_COLUMNS.map((c) => [c, COLUMN_HELP[c]]),
    ]),
    'How to fill',
  );
  const data = write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return {
    blob: new Blob([data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename: 'bls-pos-products.xlsx',
  };
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  const reply = (msg: WorkerResponse) => {
    self.postMessage(msg);
  };
  try {
    if (req.type === 'export') {
      reply({ type: 'template', ...exportFile(req.format, req.rows, req.sheet, req.filename) });
    } else if (req.type === 'template') {
      reply({ type: 'template', ...template(req.format) });
    } else if (req.type === 'parse-text') {
      reply({ type: 'parsed', result: parseCsv(req.text) });
    } else {
      reply({ type: 'parsed', result: await parseFile(req.file) });
    }
  } catch (err) {
    reply({
      type: 'error',
      message: err instanceof Error ? err.message : 'Could not read that file.',
    });
  }
};
