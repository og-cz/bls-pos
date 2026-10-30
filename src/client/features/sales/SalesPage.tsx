import { useState } from 'react';
import { Ban, Download, ReceiptText } from 'lucide-react';

import { useMe } from '@/app/session';
import { EmptyState, PageHeader } from '@/components/empty-state';
import { FormAlert, TextField } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { apiGet, apiPost } from '@/lib/api';
import { useApiGet } from '@/lib/use-api';
import { cn } from '@/lib/utils';
import { PAYMENT_LABEL } from '@shared/checkout';
import { exportFileName, type Cell } from '@shared/export';
import { formatCents } from '@shared/money';
import { hasRole } from '@shared/roles';
import type { Receipt, SaleList, SaleSummary } from '@shared/schemas/sales';

import { useImportWorker } from '../import/use-import-worker';
import { ReceiptView } from '../sell/ReceiptView';
import { DailyClose } from './DailyClose';

const time = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' });
const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function VoidForm({ receipt, onDone }: { receipt: Receipt; onDone: (r: Receipt) => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        apiPost<{ receipt: Receipt }>(`/sales/${receipt.id}/void`, { reason })
          .then((r) => {
            onDone(r.receipt);
          })
          .catch((err: unknown) => {
            setError(err instanceof Error ? err.message : 'Could not void the sale.');
          })
          .finally(() => {
            setBusy(false);
          });
      }}
    >
      <p className="text-sm text-muted-foreground">
        Voiding sale #{receipt.number} puts its items back in stock. The sale stays on record,
        marked voided, with your reason.
      </p>
      <TextField
        label="Reason"
        value={reason}
        onChange={(e) => {
          setReason(e.target.value);
        }}
        maxLength={200}
        required
        minLength={3}
        placeholder="Wrong item, customer returned it…"
      />
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Button type="submit" variant="destructive" size="lg" className="w-full" disabled={busy}>
        <Ban aria-hidden="true" />
        Void sale #{receipt.number}
      </Button>
    </form>
  );
}

/**
 * Sales (Section 6.6). Staff see their own shift: today's sales and total. Admins pick any
 * days, open any receipt, void with a reason, and export the list as a spreadsheet.
 */
export function SalesPage() {
  const { user, shop } = useMe();
  const isAdmin = hasRole(user.role, 'admin');
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const query = range ? `?from=${range.from}&to=${range.to}` : '';
  const { data, error, loading, reload } = useApiGet<SaleList>(`/sales${query}`);
  const [more, setMore] = useState<{ key: string; sales: SaleSummary[]; next: number | null }>({
    key: '',
    sales: [],
    next: null,
  });
  const [open, setOpen] = useState<Receipt | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const { downloadRows } = useImportWorker();
  const money = (c: number) => formatCents(c, shop.currency);

  // Extra pages belong to one query; a new range or a reload starts from page one again.
  const pageKey = `#${query}`;
  const extra = more.key === pageKey ? more : { sales: [], next: data?.nextBefore ?? null };
  const sales = [...(data?.sales ?? []), ...extra.sales];
  const shown = data ? { from: range?.from ?? data.from, to: range?.to ?? data.to } : null;

  function loadMore() {
    if (extra.next === null) return;
    setBusy(true);
    const sep = query ? '&' : '?';
    apiGet<SaleList>(`/sales${query}${sep}before=${extra.next}`)
      .then((page) => {
        setMore({ key: pageKey, sales: [...extra.sales, ...page.sales], next: page.nextBefore });
      })
      .catch((err: unknown) => {
        setProblem(err instanceof Error ? err.message : 'Could not load more.');
      })
      .finally(() => {
        setBusy(false);
      });
  }

  function openSale(id: string) {
    setProblem(null);
    apiGet<{ receipt: Receipt }>(`/sales/${id}`)
      .then((r) => {
        setVoiding(false);
        setOpen(r.receipt);
      })
      .catch((err: unknown) => {
        setProblem(err instanceof Error ? err.message : 'Could not open the sale.');
      });
  }

  async function exportCsv() {
    if (!shown) return;
    setBusy(true);
    setProblem(null);
    try {
      const rows: Cell[][] = [
        [
          'Sale #',
          'Date and time',
          'Cashier',
          'Payment',
          'Items',
          'Total',
          'Status',
          'Void reason',
        ],
      ];
      let before: number | null = null;
      do {
        const page: SaleList = await apiGet<SaleList>(
          `/sales?from=${shown.from}&to=${shown.to}&limit=200${before ? `&before=${before}` : ''}`,
        );
        for (const s of page.sales) {
          rows.push([
            s.number,
            dateTime.format(s.createdAt),
            s.cashier.displayName,
            PAYMENT_LABEL[s.paymentMethod] ?? s.paymentMethod,
            s.itemCount,
            s.totalCents / 100,
            s.status === 'voided' ? 'Voided' : 'Completed',
            s.voidReason,
          ]);
        }
        before = page.nextBefore;
      } while (before !== null);
      await apiPost('/audit/exports', { kind: 'sales', format: 'csv', rows: rows.length - 1 });
      // The worker applies formula-injection protection to every cell.
      await downloadRows({
        type: 'export',
        format: 'csv',
        rows,
        sheet: 'Sales',
        filename: exportFileName(shop.slug, 'sales', 'csv').replace(
          /\d{4}-\d{2}-\d{2}/,
          shown.from === shown.to ? shown.from : `${shown.from}-to-${shown.to}`,
        ),
      });
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title={isAdmin ? 'Sales' : 'My sales today'}
        description={
          isAdmin ? 'Every sale, by day. Open one to reprint or void it.' : 'Your shift so far.'
        }
      />

      {isAdmin && shown ? (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <TextField
            label="From"
            type="date"
            value={shown.from}
            max={shown.to}
            onChange={(e) => {
              if (e.target.value) setRange({ from: e.target.value, to: shown.to });
            }}
          />
          <TextField
            label="To"
            type="date"
            value={shown.to}
            min={shown.from}
            onChange={(e) => {
              if (e.target.value) setRange({ from: shown.from, to: e.target.value });
            }}
          />
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={busy || sales.length === 0}
            onClick={() => {
              void exportCsv();
            }}
          >
            <Download aria-hidden="true" />
            Export CSV
          </Button>
        </div>
      ) : null}

      {isAdmin && shown && shown.from === shown.to ? (
        <DailyClose
          key={shown.from}
          day={shown.from}
          onClosed={() => {
            setMore({ key: '', sales: [], next: null });
            reload();
          }}
        />
      ) : null}

      {error ? <FormAlert>{error}</FormAlert> : null}
      {problem ? <FormAlert>{problem}</FormAlert> : null}

      {data ? (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-card p-4">
            <div className="text-sm text-muted-foreground">Total</div>
            <div className="mt-1 text-2xl font-semibold tabular">
              {money(data.totals.grossCents)}
            </div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="text-sm text-muted-foreground">Sales</div>
            <div className="mt-1 text-2xl font-semibold tabular">
              {data.totals.salesCount.toLocaleString()}
            </div>
          </div>
          {data.totals.voidedCount > 0 ? (
            <div className="rounded-xl border bg-card p-4">
              <div className="text-sm text-muted-foreground">Voided</div>
              <div className="mt-1 text-2xl font-semibold tabular">
                {data.totals.voidedCount} · {money(data.totals.voidedCents)}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {data && sales.length === 0 ? (
        <EmptyState icon={ReceiptText} title="No sales">
          {isAdmin ? 'No sales on these days.' : 'Sales you ring up today show here.'}
        </EmptyState>
      ) : null}

      {sales.length > 0 ? (
        <ol className={cn('divide-y rounded-xl border bg-card', loading && 'opacity-60')}>
          {sales.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => {
                  openSale(s.id);
                }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              >
                <span className="w-14 shrink-0 font-medium tabular">#{s.number}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">
                    {shown?.from === shown?.to
                      ? time.format(s.createdAt)
                      : dateTime.format(s.createdAt)}
                    {' · '}
                    {s.itemCount} {s.itemCount === 1 ? 'item' : 'items'}
                    {' · '}
                    {PAYMENT_LABEL[s.paymentMethod] ?? s.paymentMethod}
                  </span>
                  {isAdmin ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {s.cashier.displayName}
                    </span>
                  ) : null}
                </span>
                <span className="text-right">
                  <span
                    className={cn(
                      'block font-semibold tabular',
                      s.status === 'voided' && 'text-muted-foreground line-through',
                    )}
                  >
                    {money(s.totalCents)}
                  </span>
                  {s.status === 'voided' ? (
                    <span className="text-xs font-medium text-destructive">Voided</span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : null}

      {extra.next !== null ? (
        <div className="mt-4 flex justify-center">
          <Button type="button" variant="outline" disabled={busy} onClick={loadMore}>
            Load more
          </Button>
        </div>
      ) : null}

      <Dialog
        open={open !== null}
        onOpenChange={(o) => {
          if (!o) setOpen(null);
        }}
        title={open ? `Sale #${open.number}` : 'Sale'}
      >
        {open && voiding ? (
          <VoidForm
            receipt={open}
            onDone={(r) => {
              setOpen(r);
              setVoiding(false);
              setMore({ key: '', sales: [], next: null });
              reload();
            }}
          />
        ) : open ? (
          <ReceiptView
            receipt={open}
            action={
              isAdmin && open.status === 'completed' ? (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => {
                    setVoiding(true);
                  }}
                >
                  <Ban aria-hidden="true" />
                  Void
                </Button>
              ) : (
                <Button
                  type="button"
                  size="lg"
                  onClick={() => {
                    setOpen(null);
                  }}
                >
                  Close
                </Button>
              )
            }
          />
        ) : null}
      </Dialog>
    </>
  );
}
