import { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { API_BASE, APP_NAME } from '@shared/app';

type ApiStatus = 'checking' | 'online' | 'offline';

export function App() {
  const [api, setApi] = useState<ApiStatus>('checking');

  useEffect(() => {
    fetch(`${API_BASE}/health`)
      .then((res) => {
        setApi(res.ok ? 'online' : 'offline');
      })
      .catch(() => {
        setApi('offline');
      });
  }, []);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md">
        <Zap className="size-8" aria-hidden="true" />
      </div>
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Hello, {APP_NAME}</h1>
        <p className="max-w-sm text-muted-foreground">
          Fast, secure point-of-sale for small businesses. Coming soon.
        </p>
      </div>
      <Button size="lg" disabled>
        Get started
      </Button>
      <p className="text-sm text-muted-foreground" role="status">
        API: {api}
      </p>
    </main>
  );
}
