import { useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { CalendarCheck, Lock, Printer } from 'lucide-react';

import { useMe } from '@/app/session';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormAlert } from '@/components/field';
import { Button } from '@/components/ui/button';
import { apiPost } from '@/lib/api';
import { useApiGet } from '@/lib/use-api';
import { PAYMENT_LABEL } from '@shared/checkout';
import { formatCents } from '@shared/money';
import type { DailyCloseView, ZReading } from '@shared/schemas/reports';

import { NOT_AN_INVOICE } from '../sell/ReceiptView';

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const longDay = new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeZone: 'UTC' });

/** The Z-reading lines, the same on screen and on paper. */
function Reading({ r, currency }: { r: ZReading; currency: string }) {
  const money = (c: number) => formatCents(c, currency);
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm tabular">
      <dt>Sale numbers</dt>
      <dd className="text-right">
        {r.firstSaleNumber === null ? '—' : `#${r.firstSaleNumber} – #${String(r.lastSaleNumber)}`}
      </dd>
      <dt>Completed sales</dt>
      <dd className="text-right">{r.salesCount.toLocaleString()}</dd>
      {Object.entries(r.payments).map(([method, p]) => (
        <div key={method} className="contents">
          <dt className="pl-3 text-muted-foreground print:text-inherit">
            {PAYMENT_LABEL[method] ?? method} ({p.count})
          </dt>
          <dd className="text-right">{money(p.cents)}</dd>
        </div>
      ))}
      <dt>Voided</dt>
      <dd className="text-right">
        {r.voidedCount} · {money(r.voidedCents)}
      </dd>
      <dt className="font-semibold">Total sales</dt>
      <dd className="text-right font-semibold">{money(r.grossCents)}</dd>
    </dl>
  );
}

/**
 * Daily close, Z-reading style (Section 7.16): the day's totals, voids and payment
 * breakdown. Closing stores them for good; after that the day's sales cannot change.
 */
export function DailyClose({ day, onClosed }: { day: string; onClosed: () => void }) {
  const { shop } = useMe();
  const { data, error, reload } = useApiGet<DailyCloseView>(`/reports/daily-close?day=${day}`);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // When the paper copy was asked for; null when not printing.
  const [printing, setPrinting] = useState<number | null>(null);

  if (error) return <FormAlert>{error}</FormAlert>;
  if (!data) return null;
  const reading = data.closing ?? data.preview;
  if (!reading) return null;
  const isToday = day === data.today;
  const title = `Daily close · ${longDay.format(new Date(`${day}T00:00:00Z`))}`;

  return (
    <section className="mb-4 rounded-xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            {data.closing ? <Lock className="size-4" aria-hidden="true" /> : null}
            Daily close
          </h2>
          <p className="text-sm text-muted-foreground">
            {data.closing
              ? `Closed by ${data.closing.closedBy.displayName}, ${dateTime.format(data.closing.closedAt)}. These totals are final.`
              : isToday
                ? 'Close the day when the shop is done selling. No more sales today after that.'
                : 'This day is still open.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              // Put the paper copy on the page, print, then take it away again.
              flushSync(() => {
                setPrinting(Date.now());
              });
              window.print();
              setPrinting(null);
            }}
          >
            <Printer aria-hidden="true" />
            Print
          </Button>
          {data.closing ? null : (
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                setConfirming(true);
              }}
            >
              <CalendarCheck aria-hidden="true" />
              Close day
            </Button>
          )}
        </div>
      </div>
      {problem ? <FormAlert>{problem}</FormAlert> : null}
      <Reading r={reading} currency={shop.currency} />

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Close this day?"
        confirmLabel="Close day"
        busy={busy}
        onConfirm={() => {
          setBusy(true);
          setProblem(null);
          apiPost('/reports/daily-close', { day })
            .then(() => {
              setConfirming(false);
              reload();
              onClosed();
            })
            .catch((err: unknown) => {
              setConfirming(false);
              setProblem(err instanceof Error ? err.message : 'Could not close the day.');
            })
            .finally(() => {
              setBusy(false);
            });
        }}
      >
        The totals are saved for good. After closing, sales on this day cannot be voided
        {isToday ? ', and no new sales can be rung up today' : ''}.
      </ConfirmDialog>

      {printing !== null
        ? createPortal(
            <div className="print-receipt">
              <div className="receipt mx-auto w-full max-w-xs font-mono text-sm leading-relaxed">
                <div className="text-center">
                  <div className="text-base font-bold">{shop.name}</div>
                  <div>{data.closing ? 'DAILY CLOSE (Z-READING)' : 'X-READING (DAY OPEN)'}</div>
                  <div>{title.replace('Daily close · ', '')}</div>
                  {data.closing ? (
                    <div>
                      Closed {dateTime.format(data.closing.closedAt)} by{' '}
                      {data.closing.closedBy.displayName}
                    </div>
                  ) : (
                    <div>Printed {dateTime.format(printing)}</div>
                  )}
                </div>
                <hr className="my-2 border-dashed border-current" />
                <Reading r={reading} currency={shop.currency} />
                <hr className="my-2 border-dashed border-current" />
                <p className="text-center text-xs">{NOT_AN_INVOICE}</p>
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}
