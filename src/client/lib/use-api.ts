import { useCallback, useEffect, useState } from 'react';

import { ApiClientError, apiGet } from './api';
import { navigate } from './router';

export type ApiState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
};

/** GETs `path` on mount and on `reload()`. A lapsed session goes back to the login page. */
export function useApiGet<T>(path: string): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  // Loading until the response for the current version arrives.
  const [doneKey, setDoneKey] = useState<string | null>(null);
  const key = `${path}#${version}`;

  useEffect(() => {
    let cancelled = false;
    apiGet<T>(path)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiClientError && err.status === 401) {
          navigate('/login', { replace: true });
          return;
        }
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      })
      .finally(() => {
        if (!cancelled) setDoneKey(`${path}#${version}`);
      });
    return () => {
      cancelled = true;
    };
  }, [path, version]);

  const reload = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);
  return { data, error, loading: doneKey !== key, reload };
}
