import { useState } from 'react';
import { ArrowLeft, ClipboardPaste, FileSpreadsheet, FileText, Upload } from 'lucide-react';

import { PageHeader } from '@/components/empty-state';
import { FormAlert } from '@/components/field';
import { Link } from '@/components/link';
import { Button } from '@/components/ui/button';
import {
  COLUMN_HELP,
  IMPORT_COLUMNS,
  MAX_IMPORT_ROWS,
  type ImportColumn,
  type ParseResult,
} from '@shared/import';
import { checkRows, type CheckedRow } from '@shared/import-validate';

import { ImportReview } from './ImportReview';
import { ImportRunner } from './ImportRunner';
import { useImportWorker } from './use-import-worker';

/** Bulk product import, step 1: get the rows in (Phase 3.5). */
export function ImportPage() {
  const { parse, downloadTemplate } = useImportWorker();
  const [result, setResult] = useState<ParseResult | null>(null);
  const [checked, setChecked] = useState<CheckedRow[]>([]);
  // Each file gets a fresh review (filters and page reset).
  const [loads, setLoads] = useState(0);
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');

  /** A fixed cell is checked again with the whole file (a SKU may now clash or not). */
  function editCell(line: number, column: ImportColumn, value: string) {
    setChecked((rows) =>
      checkRows(
        rows.map((r) => (r.line === line ? { line, values: { ...r.values, [column]: value } } : r)),
      ),
    );
  }

  async function load(input: File | string, label: string) {
    setError(null);
    setBusy(true);
    try {
      const parsed = await parse(input);
      setResult(parsed);
      setChecked(checkRows(parsed.rows));
      setLoads((n) => n + 1);
      setSource(label);
      setPasting(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Link
        href="/products"
        className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Products
      </Link>
      <PageHeader
        title="Import products"
        description="Add or update many products at once from a spreadsheet."
      />

      <div className="space-y-6">
        <section className="space-y-3 rounded-xl border bg-card p-5">
          <h2 className="font-semibold">1. Start from the template</h2>
          <p className="text-sm text-muted-foreground">
            Fill one product per row. Only <strong>name</strong> and <strong>price</strong> are
            required. Rows with a SKU that already exists update that product.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void downloadTemplate('xlsx')}>
              <FileSpreadsheet aria-hidden="true" />
              Excel template
            </Button>
            <Button variant="outline" onClick={() => void downloadTemplate('csv')}>
              <FileText aria-hidden="true" />
              CSV template
            </Button>
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">What goes in each column</summary>
            <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
              {IMPORT_COLUMNS.map((c) => (
                <div key={c} className="contents">
                  <dt className="font-mono">{c}</dt>
                  <dd className="text-muted-foreground">{COLUMN_HELP[c]}</dd>
                </div>
              ))}
            </dl>
          </details>
        </section>

        <section className="space-y-3 rounded-xl border bg-card p-5">
          <h2 className="font-semibold">2. Add your file</h2>
          {error ? <FormAlert>{error}</FormAlert> : null}
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90 focus-within:ring-[3px] focus-within:ring-ring/50">
              <Upload className="size-4" aria-hidden="true" />
              {busy ? 'Reading…' : 'Choose .xlsx or .csv'}
              <input
                type="file"
                accept=".xlsx,.xls,.ods,.csv,.tsv,.txt,text/csv"
                className="sr-only"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void load(file, file.name);
                  e.target.value = '';
                }}
              />
            </label>
            <Button
              variant="outline"
              onClick={() => {
                setPasting(!pasting);
              }}
            >
              <ClipboardPaste aria-hidden="true" />
              Paste from Google Sheets
            </Button>
          </div>
          {pasting ? (
            <div className="space-y-2">
              <label htmlFor="paste" className="text-sm font-medium">
                Copy the rows including the header row, then paste here
              </label>
              <textarea
                id="paste"
                rows={6}
                className="w-full rounded-md border border-input bg-transparent p-3 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                value={pasted}
                onChange={(e) => {
                  setPasted(e.target.value);
                }}
              />
              <Button
                disabled={!pasted.trim() || busy}
                onClick={() => void load(pasted, 'Pasted rows')}
              >
                Read pasted rows
              </Button>
            </div>
          ) : null}
        </section>

        {result ? (
          <section className="space-y-3 rounded-xl border bg-card p-5" aria-live="polite">
            <h2 className="font-semibold">
              {source}: {result.rows.length.toLocaleString()} rows
            </h2>
            {result.missing.length ? (
              <FormAlert>
                Missing required column{result.missing.length > 1 ? 's' : ''}:{' '}
                {result.missing.join(', ')}. Use the template&apos;s header row.
              </FormAlert>
            ) : null}
            {result.truncated ? (
              <FormAlert>
                Only the first {MAX_IMPORT_ROWS.toLocaleString()} rows are read. Split the rest into
                another file.
              </FormAlert>
            ) : null}
            <p className="text-sm text-muted-foreground">
              Columns found: {result.columns.join(', ') || 'none'}
              {result.ignored.length ? ` · Ignored: ${result.ignored.join(', ')}` : ''}
            </p>
            {result.missing.length === 0 && checked.length ? (
              <ImportReview key={loads} rows={checked} columns={result.columns} onEdit={editCell} />
            ) : null}
          </section>
        ) : null}

        {result && result.missing.length === 0 && checked.length ? (
          <section className="space-y-3 rounded-xl border bg-card p-5">
            <h2 className="font-semibold">3. Import</h2>
            <p className="text-sm text-muted-foreground">
              Rows with a SKU that already exists update that product; the rest are added. Rows
              without a SKU are always added as new products.
            </p>
            <ImportRunner key={loads} rows={checked} />
          </section>
        ) : null}
      </div>
    </>
  );
}
