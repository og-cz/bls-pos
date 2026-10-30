import { CloudOff, RefreshCw } from 'lucide-react';

import { Link } from '@/components/link';
import { useOnline, useQueue } from '@/lib/sync';
import { cn } from '@/lib/utils';

/**
 * Header indicator (Section 10): nothing when online with nothing waiting; "Offline"
 * when the connection is down; the count of sales not yet sent, linking to Sales.
 */
export function ConnectionStatus() {
  const online = useOnline();
  const queue = useQueue();
  const pending = queue.filter((s) => s.status === 'pending').length;
  const review = queue.length - pending;
  if (online && queue.length === 0) return null;

  const label = !online
    ? pending
      ? `Offline · ${String(pending)} unsent`
      : 'Offline'
    : review
      ? `${String(review)} need${review === 1 ? 's' : ''} review`
      : `Sending ${String(pending)}…`;
  return (
    <Link
      href="/sales"
      role="status"
      title={online ? 'Sales saved on this device' : 'No internet. Sales are saved on this device.'}
      className={cn(
        'flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium',
        !online || review
          ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
          : 'bg-primary/10 text-primary',
      )}
    >
      {online ? (
        <RefreshCw className={cn('size-3.5', !review && 'animate-spin')} aria-hidden="true" />
      ) : (
        <CloudOff className="size-3.5" aria-hidden="true" />
      )}
      {label}
    </Link>
  );
}
