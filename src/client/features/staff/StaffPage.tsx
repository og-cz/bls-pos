import { useRef, useState, type SyntheticEvent } from 'react';
import { Check, Copy, UserPlus, Users } from 'lucide-react';

import { useMe } from '@/app/session';
import { Avatar } from '@/components/avatar';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState, PageHeader } from '@/components/empty-state';
import { FormAlert, SelectField, TextField } from '@/components/field';
import { Button } from '@/components/ui/button';
import { ApiClientError, apiPost } from '@/lib/api';
import { focusFirstError, validate, withoutError, type FieldErrors } from '@/lib/form';
import { useApiGet } from '@/lib/use-api';
import { cn } from '@/lib/utils';
import { hasRole, type Role } from '@shared/roles';
import { createStaffSchema, type StaffMember } from '@shared/schemas/staff';

const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', admin: 'Admin', staff: 'Staff' };

/** Mirrors the server rule: owner manages admins and staff, admins manage staff. */
function canManage(actor: { id: string; role: Role }, member: StaffMember) {
  if (member.id === actor.id || member.role === 'owner') return false;
  return member.role === 'staff' ? hasRole(actor.role, 'admin') : actor.role === 'owner';
}

function NewPasswordCard({
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

function AddStaffForm({
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

export function StaffPage() {
  const { user, shop, entitlements } = useMe();
  const { data, error, loading, reload } = useApiGet<{ members: StaffMember[] }>('/staff');
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<{ member: StaffMember; password: string } | null>(null);
  const [toDeactivate, setToDeactivate] = useState<StaffMember | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const members = data?.members ?? [];
  const activeCount = members.filter((m) => m.role !== 'owner' && m.active).length;
  const atLimit = activeCount >= entitlements.maxStaff;

  async function deactivate() {
    if (!toDeactivate) return;
    setBusy(true);
    setActionError(null);
    try {
      await apiPost(`/staff/${toDeactivate.id}/deactivate`);
      reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
      setToDeactivate(null);
    }
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          title="Staff"
          description={`${activeCount} of ${entitlements.maxStaff} staff accounts in use.`}
        />
        {!adding && !created ? (
          <Button
            onClick={() => {
              setAdding(true);
            }}
            disabled={atLimit}
          >
            <UserPlus aria-hidden="true" />
            Add staff
          </Button>
        ) : null}
      </div>

      <div className="space-y-6">
        {atLimit && !created ? (
          <FormAlert>
            You&apos;ve reached your plan&apos;s limit. Deactivate someone who left to add someone
            new.
          </FormAlert>
        ) : null}
        {actionError ? <FormAlert>{actionError}</FormAlert> : null}

        {created ? (
          <NewPasswordCard
            member={created.member}
            password={created.password}
            shopSlug={shop.slug}
            onDone={() => {
              setCreated(null);
            }}
          />
        ) : null}

        {adding ? (
          <AddStaffForm
            canAddAdmins={user.role === 'owner'}
            onCancel={() => {
              setAdding(false);
            }}
            onCreated={(member, password) => {
              setAdding(false);
              setCreated({ member, password });
              reload();
            }}
          />
        ) : null}

        {error ? <FormAlert>{error}</FormAlert> : null}
        {loading && !data ? (
          <p role="status" className="text-muted-foreground">
            Loading…
          </p>
        ) : null}

        {data && members.length <= 1 && !adding && !created ? (
          <EmptyState
            icon={Users}
            title="No team members yet"
            action={
              <Button
                onClick={() => {
                  setAdding(true);
                }}
              >
                <UserPlus aria-hidden="true" />
                Add your first cashier
              </Button>
            }
          >
            Add cashiers so they can sell with their own login. You can see who sold what.
          </EmptyState>
        ) : null}

        {members.length > 1 ? (
          <ul className="divide-y rounded-xl border bg-card">
            {members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Avatar
                  name={m.displayName}
                  url={m.avatarUrl}
                  className={cn('size-10 text-base', !m.active && 'opacity-50 grayscale')}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {m.displayName}
                    {m.id === user.id ? (
                      <span className="text-muted-foreground"> (you)</span>
                    ) : null}
                  </div>
                  <div className="truncate text-sm text-muted-foreground">
                    @{m.username} · {ROLE_LABEL[m.role]}
                    {m.active ? null : ' · Deactivated'}
                  </div>
                </div>
                {m.active && canManage(user, m) ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setToDeactivate(m);
                    }}
                  >
                    Deactivate
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <ConfirmDialog
        open={toDeactivate !== null}
        onOpenChange={(open) => {
          if (!open) setToDeactivate(null);
        }}
        title={`Deactivate ${toDeactivate?.displayName ?? ''}?`}
        confirmLabel={busy ? 'Deactivating…' : 'Deactivate'}
        onConfirm={() => void deactivate()}
        busy={busy}
        destructive
      >
        They&apos;ll be logged out on every device right away and won&apos;t be able to log in.
        Their past sales stay in your records.
      </ConfirmDialog>
    </>
  );
}
