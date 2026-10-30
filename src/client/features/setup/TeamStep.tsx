import { useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { Printer, UserPlus } from 'lucide-react';

import { useMe } from '@/app/session';
import { Button } from '@/components/ui/button';
import { APP_NAME } from '@shared/app';
import type { StaffMember } from '@shared/schemas/staff';

import { AddStaffForm, NewPasswordCard } from '../staff/staff-forms';
import { StepLayout, type StepProps } from './StepLayout';

/** The card staff need to log in, printed for the counter. Never has a password on it. */
function LoginCard({ shopName, slug }: { shopName: string; slug: string }) {
  return (
    <div className="receipt mx-auto w-full max-w-xs space-y-2 text-center text-sm">
      <div className="text-base font-bold">{shopName}</div>
      <div>How to log in to {APP_NAME}</div>
      <ol className="space-y-1 text-left">
        <li>1. Open {location.host} on the shop phone or PC.</li>
        <li>
          2. Shop code: <strong className="font-mono">{slug}</strong>
        </li>
        <li>3. Your username and password from the owner.</li>
      </ol>
    </div>
  );
}

/** Step 4: the shop code staff log in with, and adding them now or later. */
export function TeamStep({ onNext, busy }: StepProps) {
  const { user, shop } = useMe();
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<{ member: StaffMember; password: string } | null>(null);
  const [added, setAdded] = useState(0);
  const [printing, setPrinting] = useState(false);

  return (
    <StepLayout
      title="Your team"
      description="Staff log in with your shop code, their username and a password. Add them now or any time from Staff."
      busy={busy}
      nextLabel={added ? 'Continue' : 'Skip for now'}
      next={() => {
        onNext();
      }}
    >
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <div className="text-sm text-muted-foreground">Your shop code</div>
        <div className="font-mono text-2xl font-semibold tracking-wide">{shop.slug}</div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            // Put the card on the page, print it, then take it away again.
            flushSync(() => {
              setPrinting(true);
            });
            window.print();
            setPrinting(false);
          }}
        >
          <Printer aria-hidden="true" />
          Print a login card for staff
        </Button>
      </section>

      {created ? (
        <NewPasswordCard
          member={created.member}
          password={created.password}
          shopSlug={shop.slug}
          onDone={() => {
            setCreated(null);
          }}
        />
      ) : adding ? (
        <AddStaffForm
          canAddAdmins={user.role === 'owner'}
          onCreated={(member, password) => {
            setAdding(false);
            setAdded((n) => n + 1);
            setCreated({ member, password });
          }}
          onCancel={() => {
            setAdding(false);
          }}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => {
            setAdding(true);
          }}
        >
          <UserPlus aria-hidden="true" />
          {added ? 'Add another person' : 'Add a staff member'}
        </Button>
      )}

      {printing
        ? createPortal(
            <div className="print-receipt">
              <LoginCard shopName={shop.name} slug={shop.slug} />
            </div>,
            document.body,
          )
        : null}
    </StepLayout>
  );
}
