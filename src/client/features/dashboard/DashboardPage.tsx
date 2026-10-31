import { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Lock,
  LayoutDashboard,
  PackageX,
  ShoppingCart,
} from 'lucide-react';

import { useMe } from '@/app/session';
import { EmptyState, PageHeader } from '@/components/empty-state';
import { FormAlert } from '@/components/field';
import { Link } from '@/components/link';
import { PhotoViewer, ProductPhoto } from '@/components/product-photo';
import { useApiGet } from '@/lib/use-api';
import { cn } from '@/lib/utils';
import { formatCents } from '@shared/money';
import { DASHBOARD_DAYS, type Dashboard, type IncomeTotals } from '@shared/schemas/reports';

import { IncomeChart } from './IncomeChart';

function Card({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-xl border bg-card p-4', className)}>
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** One headline number, with yesterday's for comparison. */
function Kpi({
  label,
  value,
  before,
}: {
  label: string;
  value: string;
  before?: string | undefined;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight tabular">{value}</div>
      {before ? (
        <div className="mt-1 text-xs text-muted-foreground tabular">Yesterday {before}</div>
      ) : null}
    </div>
  );
}

const avg = (t: IncomeTotals) => (t.salesCount ? Math.round(t.grossCents / t.salesCount) : 0);

/**
 * Admin dashboard (Section 6.6): today's numbers up top, sales per day for 7 or 30 days,
 * best sellers with photos, sales by staff, and stock alerts. One request.
 */
export function DashboardPage() {
  const { user } = useMe();
  const [days, setDays] = useState<(typeof DASHBOARD_DAYS)[number]>(7);
  const [viewing, setViewing] = useState<Parameters<typeof PhotoViewer>[0]['photo']>(null);
  const { data, error } = useApiGet<Dashboard>(`/reports/dashboard?days=${days}`);

  const header = (
    <PageHeader title={`Hello, ${user.displayName}`} description="Your shop at a glance." />
  );
  if (error) {
    return (
      <>
        {header}
        <FormAlert>{error}</FormAlert>
      </>
    );
  }
  if (!data) {
    return (
      <>
        {header}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border bg-card" />
          ))}
        </div>
      </>
    );
  }

  const { income, topProducts, staff, alerts } = data;
  const today = income.buckets.at(-1);
  const yesterday = income.buckets.at(-2);
  const nothingYet = income.totals.salesCount === 0 && income.totals.voidedCents === 0;
  const topMax = Math.max(1, ...topProducts.map((p) => p.revenueCents));

  return (
    <>
      {header}

      {data.locked.length ? (
        <Link
          href="/staff"
          className="mb-4 flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm hover:bg-destructive/15"
        >
          <Lock className="size-5 shrink-0 text-destructive" aria-hidden="true" />
          <span className="flex-1">
            {data.locked
              .map(
                (u) =>
                  `${u.displayName} is locked out until ${new Date(u.until).toLocaleTimeString([], { timeStyle: 'short' })}`,
              )
              .join(' · ')}
            . Too many wrong passwords. If it wasn&apos;t them, reset their password.
          </span>
          <span className="flex items-center gap-1 font-medium">
            Staff <ArrowRight className="size-4" aria-hidden="true" />
          </span>
        </Link>
      ) : null}

      {alerts.out + alerts.low > 0 ? (
        <Link
          href="/inventory"
          className="mb-4 flex items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm hover:bg-amber-500/15"
        >
          {alerts.out > 0 ? (
            <PackageX
              className="size-5 shrink-0 text-amber-700 dark:text-amber-400"
              aria-hidden="true"
            />
          ) : (
            <AlertTriangle
              className="size-5 shrink-0 text-amber-700 dark:text-amber-400"
              aria-hidden="true"
            />
          )}
          <span className="flex-1">
            {[
              alerts.out ? `${alerts.out.toLocaleString()} out of stock` : '',
              alerts.low ? `${alerts.low.toLocaleString()} running low` : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
          <span className="flex items-center gap-1 font-medium">
            Restock <ArrowRight className="size-4" aria-hidden="true" />
          </span>
        </Link>
      ) : null}

      {today ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label="Today's sales"
            value={formatCents(today.grossCents)}
            before={yesterday ? formatCents(yesterday.grossCents) : undefined}
          />
          <Kpi
            label="Transactions"
            value={today.salesCount.toLocaleString()}
            before={yesterday?.salesCount.toLocaleString()}
          />
          <Kpi
            label="Average sale"
            value={formatCents(avg(today))}
            before={yesterday ? formatCents(avg(yesterday)) : undefined}
          />
          <Kpi
            label="Gross profit"
            value={formatCents(today.profitCents)}
            before={yesterday ? formatCents(yesterday.profitCents) : undefined}
          />
        </div>
      ) : null}

      {nothingYet ? (
        <div className="mt-6">
          <EmptyState
            icon={LayoutDashboard}
            title="No sales yet"
            action={
              <Link
                href="/sell"
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 font-medium text-primary-foreground"
              >
                <ShoppingCart className="size-4" aria-hidden="true" /> Start selling
              </Link>
            }
          >
            Income by day, best sellers and sales by staff show here after your first sale.
          </EmptyState>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <section className="rounded-xl border bg-card p-4 lg:col-span-2">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">Sales per day</h2>
                <p className="text-sm text-muted-foreground tabular">
                  {formatCents(income.totals.grossCents)} ·{' '}
                  {income.totals.salesCount.toLocaleString()} sales · profit{' '}
                  {formatCents(income.totals.profitCents)}
                </p>
              </div>
              <div
                role="group"
                aria-label="Period"
                className="inline-flex rounded-lg border bg-background p-0.5"
              >
                {DASHBOARD_DAYS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={days === d}
                    onClick={() => {
                      setDays(d);
                    }}
                    className={cn(
                      'h-9 rounded-md px-3 text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                      days === d
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent',
                    )}
                  >
                    {d} days
                  </button>
                ))}
              </div>
            </div>
            <IncomeChart buckets={income.buckets} today={income.today} />
            {income.totals.voidedCents > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Voided sales ({formatCents(income.totals.voidedCents)}) are not counted.
              </p>
            ) : null}
          </section>

          <Card title="Top products">
            {topProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No products sold in this period.</p>
            ) : (
              <ol className="space-y-3">
                {topProducts.map((p) => (
                  <li key={p.productId} className="flex items-center gap-3">
                    <ProductPhoto product={p} onOpen={setViewing} className="size-10 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="truncate font-medium">{p.name}</span>
                        <span className="shrink-0 tabular">{formatCents(p.revenueCents)}</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary/70"
                          style={{ width: `${(p.revenueCents / topMax) * 100}%` }}
                        />
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground tabular">
                        {p.quantity.toLocaleString()} sold
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card title="Sales by staff" className="lg:col-span-3">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm tabular">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-2 font-medium">Name</th>
                    <th className="py-2 text-right font-medium">Sales</th>
                    <th className="py-2 text-right font-medium">Income</th>
                    <th className="py-2 text-right font-medium">Voided</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {staff.map((s) => (
                    <tr key={s.userId}>
                      <td className="py-2">
                        <span className="font-medium">{s.displayName}</span>
                        {s.active ? null : (
                          <span className="ml-2 text-xs text-muted-foreground">deactivated</span>
                        )}
                      </td>
                      <td className="py-2 text-right">{s.salesCount.toLocaleString()}</td>
                      <td className="py-2 text-right">{formatCents(s.grossCents)}</td>
                      <td className="py-2 text-right text-muted-foreground">
                        {s.voidedCount ? `${s.voidedCount} · ${formatCents(s.voidedCents)}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
      <PhotoViewer
        photo={viewing}
        onClose={() => {
          setViewing(null);
        }}
      />
    </>
  );
}
