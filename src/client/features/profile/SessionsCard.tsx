import { useState } from 'react';
import { LogOut, Monitor } from 'lucide-react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormAlert } from '@/components/field';
import { Button } from '@/components/ui/button';
import { apiDelete, apiPost } from '@/lib/api';
import { useApiGet } from '@/lib/use-api';

type SessionInfo = {
  id: string;
  device: string;
  createdAt: number;
  lastSeenAt: number;
  current: boolean;
};

const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/**
 * Where you are signed in (Section 7.2). Log out a lost phone, or every other device at
 * once (for example after sharing a password by mistake).
 */
export function SessionsCard() {
  const { data, error, reload } = useApiGet<{ sessions: SessionInfo[] }>('/me/sessions');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const others = data?.sessions.filter((s) => !s.current) ?? [];

  function run(task: () => Promise<unknown>) {
    setBusy(true);
    setProblem(null);
    task()
      .then(reload)
      .catch((err: unknown) => {
        setProblem(err instanceof Error ? err.message : 'Something went wrong.');
      })
      .finally(() => {
        setBusy(false);
      });
  }

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 font-semibold">Where you&apos;re logged in</h2>
        {others.length ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => {
              setConfirmAll(true);
            }}
          >
            <LogOut aria-hidden="true" />
            Log out other devices
          </Button>
        ) : null}
      </div>
      {error ? <FormAlert>{error}</FormAlert> : null}
      {problem ? <FormAlert>{problem}</FormAlert> : null}
      <ul className="divide-y rounded-lg border">
        {data?.sessions.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <Monitor className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">
                {s.device}
                {s.current ? (
                  <span className="ml-2 text-xs font-normal text-primary">This device</span>
                ) : null}
              </span>
              <span className="block text-xs text-muted-foreground">
                Last active {when.format(s.lastSeenAt)} · since {when.format(s.createdAt)}
              </span>
            </span>
            {s.current ? null : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  run(() => apiDelete(`/me/sessions/${s.id}`));
                }}
              >
                Log out
              </Button>
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={confirmAll}
        onOpenChange={setConfirmAll}
        title="Log out every other device?"
        confirmLabel="Log out others"
        onConfirm={() => {
          setConfirmAll(false);
          run(() => apiPost('/me/sessions/revoke-others'));
        }}
      >
        You stay logged in here. Everywhere else needs your password again. Sales saved offline on
        those devices are kept there until someone logs in again.
      </ConfirmDialog>
    </section>
  );
}
