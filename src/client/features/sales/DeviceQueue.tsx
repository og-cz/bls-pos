import { useState } from 'react';
import { AlertTriangle, CloudOff, RefreshCw, Trash2 } from 'lucide-react';

import { useMe } from '@/app/session';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { queueDelete, queuePut, type QueuedSale } from '@/lib/offline-store';
import { syncNow, useOnline, useQueue } from '@/lib/sync';
import { formatCents } from '@shared/money';
import { hasRole } from '@shared/roles';

const time = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/**
 * Sales saved on this device while offline (Section 10): waiting to send, or refused by
 * the server ("Needs review", e.g. the stock ran out meanwhile). Nothing is ever dropped
 * without a person deciding; only the owner or an admin can discard one.
 */
export function DeviceQueue() {
  const { user, shop } = useMe();
  const queue = useQueue();
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const [discarding, setDiscarding] = useState<QueuedSale | null>(null);
  const isAdmin = hasRole(user.role, 'admin');
  if (queue.length === 0) return null;

  const pending = queue.filter((s) => s.status === 'pending');
  const review = queue.filter((s) => s.status === 'review');
  const money = (c: number) => formatCents(c, shop.currency);

  function retry(items: QueuedSale[]) {
    setBusy(true);
    void Promise.all(items.map((s) => queuePut({ ...s, status: 'pending', error: null })))
      .then(() => syncNow(user.id))
      .finally(() => {
        setBusy(false);
      });
  }

  return (
    <section className="mb-4 space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <CloudOff className="size-5 text-amber-700 dark:text-amber-400" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">On this device</h2>
          <p className="text-sm text-muted-foreground">
            {pending.length
              ? `${String(pending.length)} sale${pending.length === 1 ? '' : 's'} not sent yet. ${
                  online ? 'Sending…' : 'They send by themselves when the internet is back.'
                }`
              : 'All offline sales were sent, except the ones below.'}
          </p>
        </div>
        {pending.length && online ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => {
              retry(pending);
            }}
          >
            <RefreshCw aria-hidden="true" />
            Send now
          </Button>
        ) : null}
      </div>

      <ul className="divide-y rounded-lg border bg-card">
        {queue.map((s) => (
          <li key={s.key} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block">
                {time.format(s.createdAt)} · {s.itemCount} {s.itemCount === 1 ? 'item' : 'items'}
              </span>
              {s.status === 'review' ? (
                <span className="flex items-center gap-1 text-xs font-medium text-destructive">
                  <AlertTriangle className="size-3.5" aria-hidden="true" />
                  Needs review: {s.error ?? 'refused by the server'}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">Unsynced</span>
              )}
            </span>
            <span className="font-semibold tabular">{money(s.totalCents)}</span>
            {s.status === 'review' ? (
              <span className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy || !online}
                  onClick={() => {
                    retry([s]);
                  }}
                >
                  Try again
                </Button>
                {isAdmin ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="Discard this sale"
                    onClick={() => {
                      setDiscarding(s);
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                ) : null}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {review.length && !isAdmin ? (
        <p className="text-xs text-muted-foreground">
          Ask the owner or an admin to look at sales that need review.
        </p>
      ) : null}

      <ConfirmDialog
        open={discarding !== null}
        onOpenChange={(o) => {
          if (!o) setDiscarding(null);
        }}
        title="Discard this sale?"
        confirmLabel="Discard"
        destructive
        onConfirm={() => {
          if (discarding) void queueDelete(discarding.key);
          setDiscarding(null);
        }}
      >
        It was never recorded, and it will not be. Only do this if the sale didn&apos;t really
        happen or you entered it again by hand.
      </ConfirmDialog>
    </section>
  );
}
