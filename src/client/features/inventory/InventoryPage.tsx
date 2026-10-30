import { useDeferredValue, useMemo, useState } from 'react';
import { Boxes, History, Minus, Plus, Search, SearchX } from 'lucide-react';

import { useMe } from '@/app/session';
import { EmptyState, PageHeader } from '@/components/empty-state';
import { FormAlert } from '@/components/field';
import { StockBadge } from '@/components/stock-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApiGet } from '@/lib/use-api';
import { cn } from '@/lib/utils';
import { hasRole } from '@shared/roles';
import type { MovementDto } from '@shared/schemas/inventory';
import { stockStatus } from '@shared/schemas/products';

import { searchKey, useCatalog } from '../products/use-catalog';
import { MOVEMENT_LABEL } from './labels';
import { StockDialog, type StockAction } from './StockDialog';

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function RecentMovements({ isAdmin }: { isAdmin: boolean }) {
  const { data, error } = useApiGet<{ movements: MovementDto[] }>('/inventory/movements?limit=20');
  if (error) return <FormAlert>{error}</FormAlert>;
  if (!data) return null;
  if (data.movements.length === 0) {
    return <p className="text-sm text-muted-foreground">No stock changes yet.</p>;
  }
  return (
    <ol className="divide-y rounded-xl border bg-card">
      {data.movements.map((m) => (
        <li key={m.id} className="flex items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate font-medium">{m.product.name}</div>
            <div className="text-sm text-muted-foreground">
              {MOVEMENT_LABEL[m.reason] ?? m.reason}
              {isAdmin ? ` · ${m.user.displayName}` : ''}
              {m.note ? ` · ${m.note}` : ''}
            </div>
            <div className="text-xs text-muted-foreground">{timeFormat.format(m.createdAt)}</div>
          </div>
          <span
            className={cn(
              'font-semibold tabular',
              m.delta > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-foreground',
            )}
          >
            {m.delta > 0 ? `+${m.delta.toLocaleString()}` : m.delta.toLocaleString()}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Inventory (Section 6.5): stock badges, quick Deduct with a reason for everyone,
 * Restock for admins, and recent stock history (staff see their own).
 */
export function InventoryPage() {
  const { user } = useMe();
  const isAdmin = hasRole(user.role, 'admin');
  const catalog = useCatalog();
  const [query, setQuery] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  const [action, setAction] = useState<StockAction | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const deferredQuery = useDeferredValue(query);

  // Only products that track stock belong here.
  const tracked = useMemo(() => catalog.products.filter((p) => p.trackStock), [catalog.products]);
  const low = tracked.filter((p) => p.stockStatus === 'low').length;
  const out = tracked.filter((p) => p.stockStatus === 'out').length;

  const visible = useMemo(() => {
    const q = searchKey(deferredQuery.trim());
    return tracked.filter((p) => {
      if (onlyLow && p.stockStatus === 'ok') return false;
      return (
        !q || searchKey(p.name).includes(q) || (p.sku ? searchKey(p.sku).startsWith(q) : false)
      );
    });
  }, [tracked, deferredQuery, onlyLow]);

  return (
    <>
      <PageHeader title="Inventory" />

      {tracked.length > 0 ? (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:max-w-md">
          <button
            type="button"
            aria-pressed={onlyLow}
            onClick={() => {
              setOnlyLow(!onlyLow);
            }}
            className={cn(
              'rounded-xl border p-4 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              onlyLow ? 'border-amber-500 bg-amber-500/10' : 'bg-card hover:bg-accent',
            )}
          >
            <div className="text-2xl font-semibold tabular">{low}</div>
            <div className="text-sm text-muted-foreground">Running low</div>
          </button>
          <button
            type="button"
            aria-pressed={onlyLow}
            onClick={() => {
              setOnlyLow(!onlyLow);
            }}
            className={cn(
              'rounded-xl border p-4 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              onlyLow ? 'border-destructive bg-destructive/10' : 'bg-card hover:bg-accent',
            )}
          >
            <div className="text-2xl font-semibold tabular">{out}</div>
            <div className="text-sm text-muted-foreground">Out of stock</div>
          </button>
        </div>
      ) : null}

      <div className="relative mb-4">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          placeholder="Search name or SKU"
          aria-label="Search stock by name or SKU"
          className="pl-10"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
        />
      </div>

      {catalog.error ? <FormAlert>{catalog.error}</FormAlert> : null}
      {catalog.loading && catalog.products.length === 0 ? (
        <p role="status" className="text-muted-foreground">
          Loading stock…
        </p>
      ) : null}
      {!catalog.loading && tracked.length === 0 && !catalog.error ? (
        <EmptyState icon={Boxes} title="No stock to show yet">
          Products that track stock show up here.
        </EmptyState>
      ) : null}
      {tracked.length > 0 && visible.length === 0 ? (
        <EmptyState icon={SearchX} title="No matching products" />
      ) : null}

      {visible.length > 0 ? (
        <ul className="divide-y rounded-xl border bg-card">
          {visible.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{p.name}</div>
                <div className="mt-1">
                  <StockBadge status={p.stockStatus} stock={p.stock} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-11"
                  disabled={p.stock <= 0}
                  onClick={() => {
                    setAction({ kind: 'deduct', product: p });
                  }}
                  aria-label={`Take out stock of ${p.name}`}
                >
                  <Minus aria-hidden="true" />
                  Deduct
                </Button>
                {isAdmin ? (
                  <Button
                    size="sm"
                    className="h-11"
                    onClick={() => {
                      setAction({ kind: 'restock', product: p });
                    }}
                    aria-label={`Restock ${p.name}`}
                  >
                    <Plus aria-hidden="true" />
                    Restock
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <section className="mt-8" aria-labelledby="history-heading">
        <h2 id="history-heading" className="mb-3 flex items-center gap-2 font-semibold">
          <History className="size-4" aria-hidden="true" />
          {isAdmin ? 'Recent stock changes' : 'Your recent stock changes'}
        </h2>
        {/* Remounted after each change so it reloads. */}
        <RecentMovements key={historyVersion} isAdmin={isAdmin} />
      </section>

      <StockDialog
        action={action}
        onClose={() => {
          setAction(null);
        }}
        onDone={({ stock }) => {
          if (action) {
            const updated = { ...action.product, stock };
            catalog.replace({ ...updated, stockStatus: stockStatus(updated) });
          }
          setAction(null);
          setHistoryVersion((v) => v + 1);
        }}
      />
    </>
  );
}
