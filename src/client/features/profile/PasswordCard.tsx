import { useState } from 'react';
import { Check } from 'lucide-react';

import { useMe } from '@/app/session';
import { FormAlert, PasswordField } from '@/components/field';
import { Button } from '@/components/ui/button';
import { ApiClientError, apiPost } from '@/lib/api';
import { minPasswordLength } from '@shared/password-policy';

/** Change your own password. Other devices are logged out afterwards (Section 7.2). */
export function PasswordCard() {
  const { user } = useMe();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  return (
    <form
      className="space-y-3 rounded-xl border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setErrors({});
        setError(null);
        setDone(false);
        apiPost('/me/password', { currentPassword: current, newPassword: next })
          .then(() => {
            setCurrent('');
            setNext('');
            setDone(true);
          })
          .catch((err: unknown) => {
            if (err instanceof ApiClientError && Object.keys(err.fields).length) {
              setErrors(err.fields);
            } else {
              setError(err instanceof Error ? err.message : 'Could not change the password.');
            }
          })
          .finally(() => {
            setBusy(false);
          });
      }}
    >
      <h2 className="font-semibold">Change password</h2>
      <PasswordField
        label="Current password"
        autoComplete="current-password"
        value={current}
        maxLength={128}
        onChange={(e) => {
          setCurrent(e.target.value);
        }}
        error={errors.currentPassword}
        required
      />
      <PasswordField
        label="New password"
        autoComplete="new-password"
        value={next}
        maxLength={128}
        hint={`At least ${String(minPasswordLength(user.role))} characters. A short sentence works well.`}
        onChange={(e) => {
          setNext(e.target.value);
        }}
        error={errors.newPassword}
        required
      />
      {error ? <FormAlert>{error}</FormAlert> : null}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy || !current || !next}>
          Change password
        </Button>
        {done ? (
          <span role="status" className="flex items-center gap-1 text-sm text-muted-foreground">
            <Check className="size-4" aria-hidden="true" /> Changed. Other devices were logged out.
          </span>
        ) : null}
      </div>
    </form>
  );
}
