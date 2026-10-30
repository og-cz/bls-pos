import { useMemo, useState } from 'react';
import { ShieldCheck, ShieldOff } from 'lucide-react';

import { FormAlert, TextField } from '@/components/field';
import { Button } from '@/components/ui/button';
import { apiPost } from '@/lib/api';
import { qrModules, qrPath } from '@/lib/qr';
import { useApiGet } from '@/lib/use-api';

function QrCode({ text }: { text: string }) {
  const modules = useMemo(() => qrModules(text), [text]);
  const n = modules.length;
  return (
    <svg
      viewBox={`-4 -4 ${String(n + 8)} ${String(n + 8)}`}
      className="size-44 shrink-0 rounded-lg bg-white"
      role="img"
      aria-label="QR code for your authenticator app"
      shapeRendering="crispEdges"
    >
      <path d={qrPath(modules)} fill="#000" />
    </svg>
  );
}

/**
 * Two-step login (Section 7.11), for owners and admins: scan a QR code with an
 * authenticator app (Google Authenticator, Microsoft Authenticator, 2FAS…), then enter
 * its 6-digit code at every login. Turning it off also needs a code.
 */
export function TwoFactorCard() {
  const { data, reload } = useApiGet<{ available: boolean; enabled: boolean }>('/me/2fa');
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turningOff, setTurningOff] = useState(false);

  if (!data?.available) return null;

  function run(task: () => Promise<void>) {
    setBusy(true);
    setError(null);
    task()
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      })
      .finally(() => {
        setBusy(false);
      });
  }

  const codeField = (
    <TextField
      label="6-digit code from the app"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      className="font-mono tracking-[0.3em]"
      value={code}
      onChange={(e) => {
        setCode(e.target.value.replace(/\D/g, ''));
      }}
    />
  );

  return (
    <section className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex items-start gap-3">
        {data.enabled ? (
          <ShieldCheck className="mt-0.5 size-5 text-primary" aria-hidden="true" />
        ) : (
          <ShieldOff className="mt-0.5 size-5 text-muted-foreground" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Two-step login {data.enabled ? 'is on' : 'is off'}</h2>
          <p className="text-sm text-muted-foreground">
            {data.enabled
              ? 'Logging in needs your password and a code from your authenticator app.'
              : 'Add a code from an authenticator app to every login, so a stolen password alone is not enough.'}
          </p>
        </div>
      </div>

      {!data.enabled && !setup ? (
        <Button
          type="button"
          disabled={busy}
          onClick={() => {
            run(async () => {
              setSetup(await apiPost<{ secret: string; uri: string }>('/me/2fa/setup'));
              setCode('');
            });
          }}
        >
          Set up two-step login
        </Button>
      ) : null}

      {setup ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await apiPost('/me/2fa/enable', { secret: setup.secret, code });
              setSetup(null);
              setCode('');
              reload();
            });
          }}
        >
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>Open an authenticator app on your phone and add an account.</li>
            <li>Scan this code, or type the key below.</li>
            <li>Enter the 6-digit code the app shows.</li>
          </ol>
          <div className="flex flex-wrap items-center gap-4">
            <QrCode text={setup.uri} />
            <div className="min-w-0 text-sm">
              <div className="text-muted-foreground">Key</div>
              <div className="font-mono break-all">{setup.secret.replace(/(.{4})/g, '$1 ')}</div>
            </div>
          </div>
          {codeField}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || code.length !== 6}>
              Turn on
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSetup(null);
              }}
            >
              Cancel
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Other devices signed in to your account will be logged out.
          </p>
        </form>
      ) : null}

      {data.enabled ? (
        turningOff ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await apiPost('/me/2fa/disable', { code });
                setTurningOff(false);
                setCode('');
                reload();
              });
            }}
          >
            {codeField}
            <div className="flex gap-2">
              <Button type="submit" variant="destructive" disabled={busy || code.length !== 6}>
                Turn off
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setTurningOff(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setTurningOff(true);
              setCode('');
            }}
          >
            Turn off two-step login
          </Button>
        )
      ) : null}

      {error ? <FormAlert>{error}</FormAlert> : null}
    </section>
  );
}
