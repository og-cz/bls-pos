import { useRef, useState } from 'react';
import { CheckCircle2, Upload } from 'lucide-react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormAlert } from '@/components/field';
import { Link } from '@/components/link';
import { Button } from '@/components/ui/button';
import { ApiClientError, apiPost } from '@/lib/api';
import type { CheckedRow } from '@shared/import-validate';
import { IMPORT_CHUNK_ROWS, type ImportChunkResult } from '@shared/schemas/import';

type Totals = Omit<ImportChunkResult, 'skipped'> & { skipped: ImportChunkResult['skipped'] };

const EMPTY: Totals = {
  created: 0,
  updated: 0,
  skipped: [],
  stockIgnored: 0,
  categoriesCreated: 0,
};
const RETRIES = 3;

const wait = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Retries dropped connections and server hiccups with a growing pause; other errors stop. */
async function sendChunk(rows: CheckedRow[]): Promise<ImportChunkResult> {
  const body = { rows: rows.map((r) => ({ line: r.line, values: r.values })) };
  for (let attempt = 0; ; attempt++) {
    try {
      return await apiPost<ImportChunkResult>('/products/import', body);
    } catch (err) {
      const retryable =
        err instanceof ApiClientError &&
        (err.code === 'NETWORK' || err.status >= 500 || err.code === 'IMPORT_CONFLICT');
      if (!retryable || attempt >= RETRIES) throw err;
      await wait(1000 * 2 ** attempt);
    }
  }
}

/**
 * Step 4: saves the ready rows in chunks of 250 with a progress bar (Phase 3.5). Each
 * chunk is all-or-nothing on the server, so stopping or a lost connection never leaves a
 * half-saved chunk; running it again updates by SKU instead of duplicating.
 */
export function ImportRunner({
  rows,
  onFinished,
  confirmMessage,
  onBeforeRun,
}: {
  rows: CheckedRow[];
  onFinished?: () => void;
  /** Ask before starting (restoring a backup overwrites products with the same SKU). */
  confirmMessage?: string | undefined;
  onBeforeRun?: (() => Promise<void>) | undefined;
}) {
  const [confirming, setConfirming] = useState(false);
  const ready = rows.filter((r) => r.check.ok);
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'stopped' | 'failed'>('idle');
  const [sent, setSent] = useState(0);
  const [totals, setTotals] = useState<Totals>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);
  // Read through a function: the Stop button changes it while the loop is waiting.
  const stopRequested = () => stop.current;

  async function run() {
    stop.current = false;
    if (onBeforeRun && sent === 0) {
      try {
        await onBeforeRun();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
        setState('failed');
        return;
      }
    }
    setState('running');
    setSent(0);
    setTotals(EMPTY);
    setError(null);
    let acc = EMPTY;
    for (let i = 0; i < ready.length; i += IMPORT_CHUNK_ROWS) {
      if (stopRequested()) {
        setState('stopped');
        return;
      }
      const chunk = ready.slice(i, i + IMPORT_CHUNK_ROWS);
      try {
        const r = await sendChunk(chunk);
        acc = {
          created: acc.created + r.created,
          updated: acc.updated + r.updated,
          skipped: [...acc.skipped, ...r.skipped],
          stockIgnored: acc.stockIgnored + r.stockIgnored,
          categoriesCreated: acc.categoriesCreated + r.categoriesCreated,
        };
        setTotals(acc);
        setSent(i + chunk.length);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
        setState('failed');
        return;
      }
    }
    setState('done');
    onFinished?.();
  }

  const percent = ready.length ? Math.round((sent / ready.length) * 100) : 0;

  return (
    <div className="space-y-4">
      {state === 'idle' ? (
        <Button
          size="lg"
          disabled={ready.length === 0}
          onClick={() => {
            if (confirmMessage) setConfirming(true);
            else void run();
          }}
        >
          <Upload aria-hidden="true" />
          Import {ready.length.toLocaleString()} product{ready.length === 1 ? '' : 's'}
        </Button>
      ) : null}
      {state === 'idle' && rows.length > ready.length ? (
        <p className="text-sm text-muted-foreground">
          Rows that still need fixing are left out. You can fix them first, or import them later.
        </p>
      ) : null}

      {state !== 'idle' ? (
        <div className="space-y-2">
          <div
            role="progressbar"
            aria-label="Import progress"
            aria-valuemin={0}
            aria-valuemax={ready.length}
            aria-valuenow={sent}
            className="h-3 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="text-sm text-muted-foreground tabular" aria-live="polite">
            {sent.toLocaleString()} of {ready.length.toLocaleString()} rows saved ({percent}%)
          </p>
        </div>
      ) : null}

      {state === 'running' ? (
        <Button
          variant="outline"
          onClick={() => {
            stop.current = true;
          }}
        >
          Stop after this batch
        </Button>
      ) : null}

      {error ? (
        <FormAlert>{error} Saved so far is kept; run the import again to continue.</FormAlert>
      ) : null}

      {state === 'done' || state === 'stopped' || state === 'failed' ? (
        <div className="space-y-2 rounded-lg border bg-card p-4 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="size-5 text-emerald-600" aria-hidden="true" />
            {state === 'done'
              ? 'Import finished'
              : state === 'stopped'
                ? 'Import stopped'
                : 'Import interrupted'}
          </p>
          <ul className="list-disc space-y-0.5 pl-6 text-muted-foreground">
            <li>{totals.created.toLocaleString()} added</li>
            <li>{totals.updated.toLocaleString()} updated (matched by SKU)</li>
            {totals.categoriesCreated ? <li>{totals.categoriesCreated} new categories</li> : null}
            {totals.stockIgnored ? (
              <li>
                Stock kept as it was for {totals.stockIgnored.toLocaleString()} existing products;
                change stock in Inventory.
              </li>
            ) : null}
            {totals.skipped.length ? <li>{totals.skipped.length} rows skipped</li> : null}
          </ul>
          {totals.skipped.length ? (
            <ul className="space-y-0.5 text-destructive">
              {totals.skipped.slice(0, 20).map((s) => (
                <li key={s.line}>
                  Row {s.line}: {s.message}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button asChild>
              <Link href="/products">See products</Link>
            </Button>
            {state !== 'done' ? (
              <Button variant="outline" onClick={() => void run()}>
                Run again
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Restore this backup?"
        confirmLabel="Restore"
        onConfirm={() => {
          setConfirming(false);
          void run();
        }}
      >
        {confirmMessage}
      </ConfirmDialog>
    </div>
  );
}
