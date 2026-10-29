import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';

import { BrandLogo } from '@/components/brand-logo';
import { Button } from '@/components/ui/button';
import { ApiClientError, apiGet, apiPost } from '@/lib/api';
import { navigate } from '@/lib/router';
import { APP_NAME } from '@shared/app';

type Me = {
  user: { username: string; displayName: string; role: string };
  shop: { name: string; slug: string };
};

/** Placeholder home until the app shell arrives in Phase 2: who you are, and log out. */
export function HomePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  async function logout() {
    try {
      await apiPost('/auth/logout');
    } finally {
      navigate('/login', { replace: true });
    }
  }

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
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 text-center">
      <div className="flex flex-col items-center gap-2">
        <BrandLogo decorative className="size-12" />
        <p className="text-sm text-muted-foreground">{APP_NAME}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{me.shop.name}</h1>
        <p className="text-muted-foreground">
          Logged in as <span className="font-medium text-foreground">{me.user.displayName}</span> (
          {me.user.role}) · shop code <span className="font-mono">{me.shop.slug}</span>
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        Products, selling and the dashboard are on the way.
      </p>
      <Button variant="outline" size="lg" onClick={() => void logout()}>
        <LogOut aria-hidden="true" />
        Log out
      </Button>
    </main>
  );
}
