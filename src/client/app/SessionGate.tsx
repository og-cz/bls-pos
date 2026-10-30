import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { ApiClientError, apiGet } from '@/lib/api';
import { navigate } from '@/lib/router';
import { applyShopTheme } from '@/lib/shop-theme';

import { MeContext, UpdateMeContext, type Me } from './session';

/** Loads /me once; sends signed-out visitors to the login page. */
export function SessionGate({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const update = useCallback((fn: (me: Me) => Me) => {
    setMe((current) => (current ? fn(current) : current));
  }, []);

  useEffect(() => {
    apiGet<Me>('/me')
      .then(setMe)
      .catch((err: unknown) => {
        if (err instanceof ApiClientError && err.status === 401) {
          navigate('/login', { replace: true });
        } else {
          setError(err instanceof Error ? err.message : 'Something went wrong.');
        }
      });
  }, []);

  // The shop's colors while signed in; login and signup keep the bls look.
  useEffect(() => {
    applyShopTheme(me?.shop.theme ?? null);
    return () => {
      applyShopTheme(null);
    };
  }, [me]);

  if (error) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <p role="alert" className="text-destructive">
          {error}
        </p>
      </main>
    );
  }
  if (!me) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <p role="status" className="text-muted-foreground">
          Loading…
        </p>
      </main>
    );
  }
  return (
    <UpdateMeContext value={update}>
      <MeContext value={me}>{children}</MeContext>
    </UpdateMeContext>
  );
}
