import { createContext, use } from 'react';

import { apiPost } from '@/lib/api';
import { navigate } from '@/lib/router';
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
  try {
    await apiPost('/auth/logout');
  } finally {
    navigate('/login', { replace: true });
  }
}
