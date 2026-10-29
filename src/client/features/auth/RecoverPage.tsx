import { useRef, useState, type SyntheticEvent } from 'react';

import { FormAlert, PasswordField, TextField } from '@/components/field';
import { Turnstile } from '@/components/turnstile';
import { Button } from '@/components/ui/button';
import { ApiClientError, apiPost } from '@/lib/api';
import { focusFirstError, validate, withoutError, type FieldErrors } from '@/lib/form';
import { Link } from '@/components/link';
import { navigate } from '@/lib/router';
import { recoverSchema } from '@shared/schemas/auth';

import { AuthLayout } from './AuthLayout';
import { lastShopCode, rememberShopCode } from './shop-code';

// Below this, nudge the owner to make new codes (available once account settings exist).
const LOW_CODES = 3;

export function RecoverPage() {
  const [values, setValues] = useState(() => ({
    shopSlug: lastShopCode(),
    username: '',
    code: '',
    newPassword: '',
  }));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function set(key: keyof typeof values, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((errs) => withoutError(errs, key));
  }

  async function onSubmit(e: SyntheticEvent) {
    e.preventDefault();
    setFormError(null);
    const checked = validate(recoverSchema, { ...values, turnstileToken: token ?? undefined });
    if (checked.errors) {
      setErrors(checked.errors);
      focusFirstError(formRef.current, checked.errors);
      return;
    }
    if (!token) {
      setFormError('Please complete the security check below.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiPost<{ remainingCodes: number }>('/auth/recover', checked.data);
      rememberShopCode(checked.data.shopSlug);
      setRemaining(res.remainingCodes);
    } catch (err) {
      const apiErr =
        err instanceof ApiClientError
          ? err
          : new ApiClientError(0, 'INTERNAL', 'Something went wrong.');
      setErrors(apiErr.fields);
      if (Object.keys(apiErr.fields).length) focusFirstError(formRef.current, apiErr.fields);
      else setFormError(apiErr.message);
      setToken(null);
      setTurnstileKey((k) => k + 1);
    } finally {
      setSubmitting(false);
    }
  }

  if (remaining !== null) {
    return (
      <AuthLayout
        title="Password changed"
        description="You're logged in on this device. Every other device was logged out."
      >
        <div className="space-y-6">
          <p className={remaining <= LOW_CODES ? 'font-medium text-destructive' : ''}>
            {remaining === 1 ? '1 recovery code left.' : `${remaining} recovery codes left.`}
            {remaining <= LOW_CODES ? ' Keep the rest safe — you are running low.' : null}
          </p>
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={() => {
              navigate('/', { replace: true });
            }}
          >
            Continue
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      description="Shop owners: use one of the recovery codes you saved when you created your shop."
      footer={
        <p>
          Remembered it?{' '}
          <Link
            href="/login"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Log in
          </Link>
        </p>
      }
    >
      <form ref={formRef} onSubmit={(e) => void onSubmit(e)} noValidate className="space-y-5">
        {formError ? <FormAlert>{formError}</FormAlert> : null}

        <TextField
          label="Shop code"
          name="shopSlug"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={values.shopSlug}
          onChange={(e) => {
            set('shopSlug', e.target.value);
          }}
          error={errors.shopSlug}
          maxLength={40}
          required
        />
        <TextField
          label="Owner username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={values.username}
          onChange={(e) => {
            set('username', e.target.value);
          }}
          error={errors.username}
          maxLength={32}
          required
        />
        <TextField
          label="Recovery code"
          name="code"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="XXXXX-XXXXX"
          className="font-mono tracking-wider uppercase"
          value={values.code}
          onChange={(e) => {
            set('code', e.target.value);
          }}
          error={errors.code}
          maxLength={32}
          required
        />
        <PasswordField
          label="New password"
          name="newPassword"
          autoComplete="new-password"
          value={values.newPassword}
          onChange={(e) => {
            set('newPassword', e.target.value);
          }}
          error={errors.newPassword}
          hint="At least 10 characters."
          maxLength={128}
          required
        />

        <Turnstile key={turnstileKey} onToken={setToken} />

        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? 'Saving…' : 'Set new password'}
        </Button>
      </form>
    </AuthLayout>
  );
}
