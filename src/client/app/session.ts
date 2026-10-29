import { createContext, use } from 'react';

import { apiPost } from '@/lib/api';
import { navigate } from '@/lib/router';
import type { Entitlements } from '@shared/entitlements';
import type { Role } from '@shared/roles';

export type Me = {
  user: { id: string; username: string; displayName: string; role: Role };
  shop: { id: string; slug: string; name: string; plan: string };
  entitlements: Entitlements;
};

export const MeContext = createContext<Me | null>(null);

/** The signed-in user. Only use inside <SessionGate>. */
export function useMe(): Me {
  const me = use(MeContext);
  if (!me) throw new Error('useMe() outside <SessionGate>');
  return me;
}

export async function logout() {
  try {
    await apiPost('/auth/logout');
  } finally {
    navigate('/login', { replace: true });
  }
}
