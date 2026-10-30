import { useState } from 'react';
import { UserPlus, Users } from 'lucide-react';

import { useMe } from '@/app/session';
import { Avatar } from '@/components/avatar';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState, PageHeader } from '@/components/empty-state';
import { FormAlert } from '@/components/field';
import { Button } from '@/components/ui/button';
import { apiPost } from '@/lib/api';
import { useApiGet } from '@/lib/use-api';
import { cn } from '@/lib/utils';
import { hasRole, type Role } from '@shared/roles';
import type { StaffMember } from '@shared/schemas/staff';

import { AddStaffForm, NewPasswordCard } from './staff-forms';

const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', admin: 'Admin', staff: 'Staff' };

/** Mirrors the server rule: owner manages admins and staff, admins manage staff. */
function canManage(actor: { id: string; role: Role }, member: StaffMember) {
  if (member.id === actor.id || member.role === 'owner') return false;
  return member.role === 'staff' ? hasRole(actor.role, 'admin') : actor.role === 'owner';
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
