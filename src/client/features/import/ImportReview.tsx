import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ImportColumn } from '@shared/import';
import { describeProblems, type CheckedRow } from '@shared/import-validate';

const PAGE = 50;

type Props = {
  rows: CheckedRow[];
  columns: ImportColumn[];
  onEdit: (line: number, column: ImportColumn, value: string) => void;
};

/**
 * Step 3: every row checked before anything is saved. Problems are listed in plain words
 * ("Row 214: price is missing") and fixed by editing the cell right here.
 */
export function ImportReview({ rows, columns, onEdit }: Props) {
  const problems = useMemo(() => rows.filter((r) => !r.check.ok), [rows]);
  const [onlyProblems, setOnlyProblems] = useState(problems.length > 0);
  const [page, setPage] = useState(0);
  // Rows that had problems when the filter was turned on stay listed once fixed, so a row
  // doesn't vanish while someone is still typing in it.
  const [pinned, setPinned] = useState(() => new Set(problems.map((r) => r.line)));

  const shown = onlyProblems ? rows.filter((r) => !r.check.ok || pinned.has(r.line)) : rows;
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const current = Math.min(page, pages - 1);
  const slice = shown.slice(current * PAGE, (current + 1) * PAGE);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3" aria-live="polite">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-sm font-medium text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          {(rows.length - problems.length).toLocaleString()} ready
        </span>
        {problems.length ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1 text-sm font-medium text-destructive">
            <AlertTriangle className="size-4" aria-hidden="true" />
            {problems.length.toLocaleString()} need fixing
          </span>
        ) : null}
        {problems.length ? (
          <label className="ml-auto flex min-h-11 cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-5 accent-primary"
              checked={onlyProblems}
              onChange={(e) => {
                setOnlyProblems(e.target.checked);
                setPinned(new Set(problems.map((r) => r.line)));
                setPage(0);
              }}
            />
            Show only rows with problems
          </label>
        ) : null}
      </div>

      {slice.length === 0 ? (
        <p className="text-sm text-muted-foreground">All rows are ready.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th scope="col" className="px-2 py-2 font-medium">
                  Row
                </th>
                {columns.map((c) => (
                  <th key={c} scope="col" className="px-2 py-2 font-medium whitespace-nowrap">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {slice.map((r) => {
                const errors = r.check.ok ? {} : r.check.errors;
                return (
                  <tr key={r.line} className={r.check.ok ? undefined : 'bg-destructive/5'}>
                    <th
                      scope="row"
                      className="px-2 py-1 align-top font-normal text-muted-foreground tabular"
                    >
                      {r.line}
                    </th>
                    {columns.map((c) => {
                      const error = errors[c];
                      return (
                        <td key={c} className="px-1 py-1 align-top">
                          <input
                            aria-label={`Row ${r.line} ${c}`}
                            aria-invalid={error ? true : undefined}
                            title={error}
                            value={r.values[c]}
                            onChange={(e) => {
                              onEdit(r.line, c, e.target.value);
                            }}
                            className={cn(
                              'h-9 w-full min-w-24 rounded-md border bg-transparent px-2 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
                              error
                                ? 'border-destructive'
                                : 'border-transparent hover:border-input',
                            )}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* The same problems as text, so they're easy to read and to scan with a screen reader. */}
      {onlyProblems && slice.length ? (
        <ul className="space-y-1 text-sm text-destructive">
          {slice
            .filter((r) => !r.check.ok)
            .map((r) => (
              <li key={r.line}>{describeProblems(r)}</li>
            ))}
        </ul>
      ) : null}

      {pages > 1 ? (
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={current === 0}
            onClick={() => {
              setPage(current - 1);
            }}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground tabular">
            Page {current + 1} of {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={current >= pages - 1}
            onClick={() => {
              setPage(current + 1);
            }}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
