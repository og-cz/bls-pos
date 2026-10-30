import { useRef, useState, type SyntheticEvent } from 'react';
import { Check, Copy } from 'lucide-react';

import { FormAlert, SelectField, TextField } from '@/components/field';
import { Button } from '@/components/ui/button';
import { ApiClientError, apiPost } from '@/lib/api';
import { focusFirstError, validate, withoutError, type FieldErrors } from '@/lib/form';
import { createStaffSchema, type StaffMember } from '@shared/schemas/staff';

/** The new member's login details, shown once after they are added. */
export function NewPasswordCard({
  member,
  password,
  shopSlug,
  onDone,
}: {
  member: StaffMember;
  password: string;
  shopSlug: string;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const text = `Shop code: ${shopSlug}\nUsername: ${member.username}\nTemporary password: ${password}`;
  return (
    <div role="status" className="space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-5">
      <div>
        <h2 className="font-semibold">{member.displayName} can now log in</h2>
        <p className="text-sm text-muted-foreground">
          Give them these details. The password is shown only once.
        </p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Shop code</dt>
        <dd className="font-mono">{shopSlug}</dd>
        <dt className="text-muted-foreground">Username</dt>
        <dd className="font-mono">{member.username}</dd>
        <dt className="text-muted-foreground">Password</dt>
        <dd className="font-mono text-base font-semibold tracking-wider">{password}</dd>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => {
            navigator.clipboard.writeText(text).then(
              () => {
                setCopied(true);
              },
              () => undefined,
            );
          }}
        >
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy details'}
        </Button>
        <Button onClick={onDone}>Done</Button>
      </div>
    </div>
  );
}

export function AddStaffForm({
  canAddAdmins,
  onCreated,
  onCancel,
}: {
  canAddAdmins: boolean;
  onCreated: (member: StaffMember, password: string) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState({ displayName: '', username: '', role: 'staff' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function set(key: keyof typeof values, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((errs) => withoutError(errs, key));
  }

  async function onSubmit(e: SyntheticEvent) {
    e.preventDefault();
    setFormError(null);
    const checked = validate(createStaffSchema, values);
    if (checked.errors) {
      setErrors(checked.errors);
      focusFirstError(formRef.current, checked.errors);
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiPost<{ user: StaffMember; temporaryPassword: string }>(
        '/staff',
        checked.data,
      );
      onCreated(res.user, res.temporaryPassword);
    } catch (err) {
      const apiErr =
        err instanceof ApiClientError
          ? err
          : new ApiClientError(0, 'INTERNAL', 'Something went wrong.');
      setErrors(apiErr.fields);
      if (Object.keys(apiErr.fields).length) focusFirstError(formRef.current, apiErr.fields);
      else setFormError(apiErr.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={(e) => void onSubmit(e)}
      noValidate
      className="space-y-5 rounded-xl border bg-card p-5"
    >
      <h2 className="font-semibold">Add a team member</h2>
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Name"
          name="displayName"
          value={values.displayName}
          onChange={(e) => {
            set('displayName', e.target.value);
          }}
          error={errors.displayName}
          maxLength={60}
          required
        />
        <TextField
          label="Username"
          name="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={values.username}
          onChange={(e) => {
            set('username', e.target.value);
          }}
          error={errors.username}
          hint="What they type to log in."
          maxLength={32}
          required
        />
      </div>
      {canAddAdmins ? (
        <SelectField
          label="Role"
          name="role"
          value={values.role}
          onChange={(e) => {
            set('role', e.target.value);
          }}
          error={errors.role}
          hint="Staff sell and deduct stock. Admins also manage products, staff and reports."
        >
          <option value="staff">Staff (cashier)</option>
          <option value="admin">Admin (manager)</option>
        </SelectField>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add and create password'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
