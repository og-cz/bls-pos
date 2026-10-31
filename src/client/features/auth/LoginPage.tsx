import { useRef, useState, type SyntheticEvent } from 'react';

import { homeFor } from '@/app/nav';
import { FormAlert, PasswordField, TextField } from '@/components/field';
import { Turnstile } from '@/components/turnstile';
import { Button } from '@/components/ui/button';
import { ApiClientError, apiPost } from '@/lib/api';
import { focusFirstError, validate, withoutError, type FieldErrors } from '@/lib/form';
import { Link } from '@/components/link';
import { navigate } from '@/lib/router';
import type { Role } from '@shared/roles';
import { loginSchema } from '@shared/schemas/auth';

import { AuthLayout } from './AuthLayout';
import { lastShopCode, rememberShopCode } from './shop-code';

const linkClass = 'font-medium text-primary underline-offset-4 hover:underline';

export function LoginPage() {
  const [values, setValues] = useState(() => ({
    shopSlug: lastShopCode(),
    username: '',
    password: '',
    totpCode: '',
  }));
  // Two-step login: the server asks for the app code after the password is right.
  const [needsCode, setNeedsCode] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  // The server asks for Turnstile only after a few failed logins (Section 7.3).
  const [needsHuman, setNeedsHuman] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function set(key: keyof typeof values, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((errs) => withoutError(errs, key));
  }

  async function onSubmit(e: SyntheticEvent) {
    e.preventDefault();
    setFormError(null);
    const { totpCode, ...rest } = values;
    const checked = validate(loginSchema, {
      ...rest,
      ...(needsCode ? { totpCode } : {}),
      turnstileToken: token ?? undefined,
    });
    if (checked.errors) {
      setErrors(checked.errors);
      focusFirstError(formRef.current, checked.errors);
      return;
    }
    if (needsHuman && !token) {
      setFormError('Please complete the security check below.');
      return;
    }

    setSubmitting(true);
    try {
      const { role } = await apiPost<{ role: Role }>('/auth/login', checked.data);
      rememberShopCode(checked.data.shopSlug);
      navigate(homeFor(role), { replace: true });
    } catch (err) {
      const apiErr =
        err instanceof ApiClientError
          ? err
          : new ApiClientError(0, 'INTERNAL', 'Something went wrong.');
      if (apiErr.code.startsWith('TURNSTILE_')) setNeedsHuman(true);
      if (apiErr.code === 'INVALID_CREDENTIALS') {
        setNeedsCode(false);
        setValues((v) => ({ ...v, password: '', totpCode: '' }));
      }
      if (apiErr.code === 'TOTP_REQUIRED') {
        // Not an error: the next step.
        setNeedsCode(true);
        setToken(null);
        setTurnstileKey((k) => k + 1);
        return;
      }
      if (apiErr.code === 'INVALID_TOTP') setValues((v) => ({ ...v, totpCode: '' }));
      setFormError(apiErr.message);
      setToken(null);
      setTurnstileKey((k) => k + 1);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Log in"
      description="Enter your shop code, username and password."
      footer={
        <>
          <p>
            Forgot your password? Owners can{' '}
            <Link href="/recover" className={linkClass}>
              use a recovery code
            </Link>
            . Staff, ask your shop admin.
          </p>
          <p>
            New here?{' '}
            <Link href="/signup" className={linkClass}>
              Create a shop
            </Link>
          </p>
          <p className="text-xs">
            <Link href="/privacy" className="hover:underline">
              Privacy
            </Link>
            {' · '}
            <Link href="/terms" className="hover:underline">
              Terms
            </Link>
          </p>
        </>
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
          label="Username"
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
        <PasswordField
          label="Password"
          name="password"
          autoComplete="current-password"
          value={values.password}
          onChange={(e) => {
            set('password', e.target.value);
          }}
          error={errors.password}
          maxLength={128}
          required
        />

        {needsCode ? (
          <TextField
            label="Code from your authenticator app"
            name="totpCode"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={6}
            className="font-mono tracking-[0.3em]"
            value={values.totpCode}
            onChange={(e) => {
              set('totpCode', e.target.value.replace(/\D/g, ''));
            }}
            error={errors.totpCode}
            hint="Two-step login is on for this account."
            required
          />
        ) : null}

        {needsHuman ? <Turnstile key={turnstileKey} onToken={setToken} /> : null}

        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? 'Logging in…' : 'Log in'}
        </Button>
      </form>
    </AuthLayout>
  );
}
