import { useEffect, useState } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';

import { useMe } from '@/app/session';
import { FormAlert } from '@/components/field';
import { Button } from '@/components/ui/button';
import { apiGet, apiPost } from '@/lib/api';

import { RecoveryCodes } from '../auth/RecoveryCodes';
import { StepLayout, type StepProps } from './StepLayout';

/**
 * Step 5: make sure the owner can get back in (Section 7.12). There is no email reset, so
 * confirming the recovery codes are saved is required; a new set can be made if lost.
 */
export function SecurityStep({ onNext, busy }: StepProps) {
  const { user, shop } = useMe();
  const isOwner = user.role === 'owner';
  const [remaining, setRemaining] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [fresh, setFresh] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [making, setMaking] = useState(false);

  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    apiGet<{ remaining: number }>('/me/recovery-codes')
      .then((r) => {
        if (!cancelled) setRemaining(r.remaining);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isOwner]);

  if (!isOwner) {
    return (
      <StepLayout
        title="Keep your account safe"
        description="Only the owner has recovery codes. Keep your password to yourself."
        busy={busy}
        next={() => {
          onNext();
        }}
      >
        <ShieldCheck className="size-10 text-primary" aria-hidden="true" />
      </StepLayout>
    );
  }

  if (fresh) {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Your new recovery codes</h1>
          <p className="text-muted-foreground">
            The old codes no longer work. Save these somewhere safe, away from this phone or PC.
          </p>
        </div>
        <RecoveryCodes
          codes={fresh}
          shopSlug={shop.slug}
          username={user.username}
          onDone={() => {
            onNext();
          }}
        />
      </div>
    );
  }

  return (
    <StepLayout
      title="Keep your shop safe"
      description="If you forget your password, a recovery code is the only way back in. You saved them when you signed up."
      busy={busy}
      nextDisabled={!confirmed}
      next={() => {
        onNext();
      }}
    >
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-3">
          <KeyRound className="size-6 text-primary" aria-hidden="true" />
          <div>
            <div className="font-medium">Recovery codes</div>
            <div className="text-sm text-muted-foreground">
              {remaining === null ? 'Checking…' : `${String(remaining)} of 10 still unused`}
            </div>
          </div>
        </div>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-5 shrink-0 accent-primary"
            checked={confirmed}
            onChange={(e) => {
              setConfirmed(e.target.checked);
            }}
          />
          <span>I have my recovery codes saved somewhere safe.</span>
        </label>
        <Button
          type="button"
          variant="outline"
          disabled={making}
          onClick={() => {
            setMaking(true);
            setError(null);
            apiPost<{ codes: string[] }>('/me/recovery-codes')
              .then(({ codes }) => {
                setFresh(codes);
              })
              .catch((err: unknown) => {
                setError(err instanceof Error ? err.message : 'Could not make new codes.');
              })
              .finally(() => {
                setMaking(false);
              });
          }}
        >
          Lost them? Make new codes
        </Button>
      </section>
      {error ? <FormAlert>{error}</FormAlert> : null}
      <p className="text-sm text-muted-foreground">
        Want more protection? Turn on two-step login with an authenticator app in My profile.
      </p>
    </StepLayout>
  );
}
