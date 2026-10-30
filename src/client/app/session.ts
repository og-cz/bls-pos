import { createContext, use } from 'react';

import { apiPost } from '@/lib/api';
import { clearOffline, queueAll } from '@/lib/offline-store';
import { navigate } from '@/lib/router';
import type { BusinessType } from '@shared/business';
import type { Entitlements } from '@shared/entitlements';
import type { Role } from '@shared/roles';
import type { Theme } from '@shared/theme';

export type Me = {
  user: {
    id: string;
    username: string;
    displayName: string;
    role: Role;
    avatarUrl: string | null;
  };
  shop: {
    id: string;
    slug: string;
    name: string;
    plan: string;
    currency: string;
    businessType: BusinessType;
    onboardingStep: number;
    theme: Theme;
    logoUrl: string | null;
    coverUrl: string | null;
  };
  entitlements: Entitlements;
};

export const MeContext = createContext<Me | null>(null);
export const UpdateMeContext = createContext<((update: (me: Me) => Me) => void) | null>(null);

/** The signed-in user. Only use inside <SessionGate>. */
export function useMe(): Me {
  const me = use(MeContext);
  if (!me) throw new Error('useMe() outside <SessionGate>');
  return me;
}

/** Updates the signed-in session after a change (e.g. the shop's theme was saved). */
export function useUpdateMe(): (update: (me: Me) => Me) => void {
  const update = use(UpdateMeContext);
  if (!update) throw new Error('useUpdateMe() outside <SessionGate>');
  return update;
}

export async function logout() {
  // Offline sales live only on this device; logging out removes them (Section 10).
  // Never silently: say how many and let the person decide.
  const waiting = (await queueAll().catch(() => [])).length;
  if (
    waiting > 0 &&
    !window.confirm(
      `${String(waiting)} sale${waiting === 1 ? ' is' : 's are'} saved on this device and not sent yet. Log out anyway? ${waiting === 1 ? 'It' : 'They'} will be lost. Connect to the internet first to send ${waiting === 1 ? 'it' : 'them'}.`,
    )
  ) {
    return;
  }
  try {
    await apiPost('/auth/logout');
  } finally {
    await clearOffline();
    navigate('/login', { replace: true });
  }
}
