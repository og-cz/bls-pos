import { useRef, useState, type SyntheticEvent } from 'react';

import { FormAlert, PasswordField, SelectField, TextField } from '@/components/field';
import { Turnstile } from '@/components/turnstile';
import { Button } from '@/components/ui/button';
import { ApiClientError, apiPost } from '@/lib/api';
import { focusFirstError, validate, withoutError, type FieldErrors } from '@/lib/form';
import { Link } from '@/components/link';
import { navigate } from '@/lib/router';
import { BUSINESS_LABEL, BUSINESS_TYPES, type BusinessType } from '@shared/business';
import { signupSchema } from '@shared/schemas/auth';
import { slugify } from '@shared/slug';

import { AuthLayout } from './AuthLayout';
import { RecoveryCodes } from './RecoveryCodes';
import { rememberShopCode } from './shop-code';

type SignupResponse = {
  shop: { slug: string };
  user: { username: string };
  recoveryCodes: string[];
};

export function SignupPage() {
  const [values, setValues] = useState({
    shopName: '',
    shopSlug: '',
    businessType: 'cafe' as BusinessType,
    ownerName: '',
    username: '',
    password: '',
  });
  // The shop code follows the shop name until the owner edits it.
  const [slugEdited, setSlugEdited] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<SignupResponse | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function set<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
    setValues((v) => {
      const next = { ...v, [key]: value };
      if (key === 'shopName' && !slugEdited) next.shopSlug = slugify(next.shopName);
      return next;
    });
    if (errors[key]) setErrors((errs) => withoutError(errs, key));
  }

  async function onSubmit(e: SyntheticEvent) {
    e.preventDefault();
    setFormError(null);
    const checked = validate(signupSchema, { ...values, turnstileToken: token ?? undefined });
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
      const res = await apiPost<SignupResponse>('/auth/signup', checked.data);
      rememberShopCode(res.shop.slug);
      setCreated(res);
    } catch (err) {
      const apiErr =
        err instanceof ApiClientError
          ? err
          : new ApiClientError(0, 'INTERNAL', 'Something went wrong.');
      setErrors(apiErr.fields);
      if (Object.keys(apiErr.fields).length) focusFirstError(formRef.current, apiErr.fields);
      else setFormError(apiErr.message);
      // Turnstile tokens work once; get a fresh one for the next try.
      setToken(null);
      setTurnstileKey((k) => k + 1);
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <AuthLayout
        title="Save your recovery codes"
        description="If you forget your password, one of these codes lets you set a new one. Each works once. We can't show them again."
      >
        <RecoveryCodes
          codes={created.recoveryCodes}
          shopSlug={created.shop.slug}
          username={created.user.username}
          onDone={() => {
            navigate('/', { replace: true });
          }}
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your shop"
      description="Set up your shop and owner account. It's free."
      footer={
        <p>
          Already have a shop?{' '}
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
          label="Shop name"
          name="shopName"
          autoComplete="organization"
          value={values.shopName}
          onChange={(e) => {
            set('shopName', e.target.value);
          }}
          error={errors.shopName}
          maxLength={80}
          required
        />
        <TextField
          label="Shop code"
          name="shopSlug"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={values.shopSlug}
          onChange={(e) => {
            setSlugEdited(true);
            set('shopSlug', e.target.value.toLowerCase());
          }}
          error={errors.shopSlug}
          hint="You and your staff type this to log in. Lowercase letters, numbers and dashes."
          maxLength={40}
          required
        />
        <SelectField
          label="Type of business"
          name="businessType"
          value={values.businessType}
          onChange={(e) => {
            set('businessType', e.target.value as BusinessType);
          }}
          error={errors.businessType}
        >
          {BUSINESS_TYPES.map((type) => (
            <option key={type} value={type}>
              {BUSINESS_LABEL[type]}
            </option>
          ))}
        </SelectField>

        <hr />

        <TextField
          label="Your name"
          name="ownerName"
          autoComplete="name"
          value={values.ownerName}
          onChange={(e) => {
            set('ownerName', e.target.value);
          }}
          error={errors.ownerName}
          maxLength={60}
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
          autoComplete="new-password"
          value={values.password}
          onChange={(e) => {
            set('password', e.target.value);
          }}
          error={errors.password}
          hint="At least 10 characters. A short sentence is easy to remember and hard to guess."
          maxLength={128}
          required
        />

        <Turnstile key={turnstileKey} onToken={setToken} />

        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? 'Creating your shop…' : 'Create shop'}
        </Button>
      </form>
    </AuthLayout>
  );
}
