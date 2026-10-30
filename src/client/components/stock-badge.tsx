import { cn } from '@/lib/utils';
import type { StockStatus } from '@shared/schemas/products';

const STYLES: Record<Exclude<StockStatus, 'untracked'>, string> = {
  ok: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  low: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  out: 'bg-destructive/10 text-destructive',
};

/** Green in stock, amber low, red out (Section 6.5). Words too, not just color. */
export function StockBadge({ status, stock }: { status: StockStatus; stock: number }) {
  if (status === 'untracked') {
    return <span className="text-sm text-muted-foreground">Not tracked</span>;
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular whitespace-nowrap',
        STYLES[status],
      )}
    >
      {status === 'out' ? 'Out of stock' : `${stock.toLocaleString()} left`}
      {status === 'low' ? ' · Low' : null}
    </span>
  );
}
