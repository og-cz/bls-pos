import { useState } from 'react';

import { cn } from '@/lib/utils';
import { formatCents } from '@shared/money';
import type { IncomeBucket } from '@shared/schemas/reports';

const dayLabel = new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' });
const dateLabel = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const longLabel = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

const asDate = (day: string) => new Date(`${day}T00:00:00Z`);

/** A round top for the axis: 1, 2 or 5 times a power of ten. */
function niceMax(value: number): number {
  if (value <= 0) return 100_00;
  const pow = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((m) => m * pow >= value) ?? 10;
  return step * pow;
}

function shortPeso(cents: number): string {
  const pesos = cents / 100;
  if (pesos >= 1_000_000) return `₱${(pesos / 1_000_000).toLocaleString()}M`;
  if (pesos >= 1_000) return `₱${(pesos / 1_000).toLocaleString()}k`;
  return `₱${pesos.toLocaleString()}`;
}

/**
 * Sales per day as bars, one series in the brand color. Hover or focus a bar for the day's
 * numbers; the same data is in a table below for screen readers and exact values.
 */
export function IncomeChart({ buckets, today }: { buckets: IncomeBucket[]; today: string }) {
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(...buckets.map((b) => b.grossCents)));
  const ticks = [max, max / 2, 0];
  const many = buckets.length > 10;
  const shown = active === null ? null : buckets[active];

  return (
    <div>
      <div className="relative flex h-48 gap-2">
        {/* Axis labels */}
        <div className="flex w-12 shrink-0 flex-col justify-between text-right text-xs text-muted-foreground tabular">
          {ticks.map((t) => (
            <span key={t} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">
              {shortPeso(t)}
            </span>
          ))}
        </div>
        <div
          className="relative flex-1"
          onMouseLeave={() => {
            setActive(null);
          }}
        >
          {/* Grid: quiet lines behind the bars */}
          {ticks.map((t, i) => (
            <div
              key={t}
              className={cn(
                'absolute inset-x-0 border-t',
                i === 2 ? 'border-border' : 'border-border/50',
              )}
              style={{ top: `${(i / 2) * 100}%` }}
            />
          ))}
          <div className={cn('absolute inset-0 flex items-end', many ? 'gap-0.5' : 'gap-1.5')}>
            {buckets.map((b, i) => {
              const pct = (b.grossCents / max) * 100;
              return (
                <button
                  key={b.key}
                  type="button"
                  aria-label={`${longLabel.format(asDate(b.key))}: ${formatCents(b.grossCents)}, ${b.salesCount} sales`}
                  onMouseEnter={() => {
                    setActive(i);
                  }}
                  onFocus={() => {
                    setActive(i);
                  }}
                  onBlur={() => {
                    setActive(null);
                  }}
                  className="group flex h-full flex-1 items-end outline-none"
                >
                  <span
                    className={cn(
                      'w-full rounded-t-[4px] transition-colors',
                      b.key === today ? 'bg-primary' : 'bg-primary/60',
                      active === i && 'bg-primary ring-2 ring-ring/50',
                      b.grossCents === 0 && 'bg-transparent',
                    )}
                    style={{ height: b.grossCents ? `max(${pct}%, 3px)` : 0 }}
                  />
                </button>
              );
            })}
          </div>
          {shown && active !== null ? (
            <div
              role="status"
              className="pointer-events-none absolute -top-2 z-10 w-max -translate-x-1/2 -translate-y-full rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md"
              style={{
                left: `clamp(4rem, ${((active + 0.5) / buckets.length) * 100}%, calc(100% - 4rem))`,
              }}
            >
              <div className="font-medium">{longLabel.format(asDate(shown.key))}</div>
              <div className="tabular">{formatCents(shown.grossCents)}</div>
              <div className="text-xs text-muted-foreground">
                {shown.salesCount} {shown.salesCount === 1 ? 'sale' : 'sales'} · profit{' '}
                {formatCents(shown.profitCents)}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {/* Day labels: every day for a week, a few for a month */}
      <div className="ml-14 mt-2 flex gap-1.5 text-xs text-muted-foreground">
        {buckets.map((b, i) => (
          <span key={b.key} className="flex-1 truncate text-center">
            {many
              ? i % 7 === (buckets.length - 1) % 7
                ? dateLabel.format(asDate(b.key))
                : ''
              : b.key === today
                ? 'Today'
                : dayLabel.format(asDate(b.key))}
          </span>
        ))}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted-foreground">Show as table</summary>
        <table className="mt-2 w-full text-left tabular">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Day</th>
              <th className="py-1 text-right font-medium">Sales</th>
              <th className="py-1 text-right font-medium">Income</th>
              <th className="py-1 text-right font-medium">Profit</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {buckets.map((b) => (
              <tr key={b.key}>
                <td className="py-1">{dateLabel.format(asDate(b.key))}</td>
                <td className="py-1 text-right">{b.salesCount}</td>
                <td className="py-1 text-right">{formatCents(b.grossCents)}</td>
                <td className="py-1 text-right">{formatCents(b.profitCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
