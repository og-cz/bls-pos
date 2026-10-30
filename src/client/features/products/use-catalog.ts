import { useCallback, useEffect, useState } from 'react';

import { ApiClientError, apiGet } from '@/lib/api';
import { kvGet, kvSet } from '@/lib/offline-store';
import { navigate } from '@/lib/router';
import type { CategoryDto } from '@shared/schemas/categories';
import type { ProductDto } from '@shared/schemas/products';

type Page = { products: ProductDto[]; nextCursor: string | null };

const OFFLINE_KEY = 'catalog';
type Snapshot = { products: ProductDto[]; categories: CategoryDto[]; savedAt: number };

async function fetchAllProducts(archived: boolean): Promise<ProductDto[]> {
  const all: ProductDto[] = [];
  let cursor: string | null = null;
  do {
    const params = new URLSearchParams({ limit: '100' });
    if (archived) params.set('archived', 'true');
    if (cursor) params.set('cursor', cursor);
    const page: Page = await apiGet<Page>(`/products?${params.toString()}`);
    all.push(...page.products);
    cursor = page.nextCursor;
  } while (cursor);
  return all;
}

export type Catalog = {
  products: ProductDto[];
  categories: CategoryDto[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  /** Replaces one product in place after an edit, without reloading everything. */
  replace: (product: ProductDto) => void;
  /** When offline: when the device's copy of the list was saved. */
  offlineSince: number | null;
};

/**
 * The shop's whole catalog, loaded once and searched on the device, so typing in the
 * search box never waits for the network (Section 6.0: search under 100 ms).
 */
export function useCatalog(archived = false): Catalog {
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [doneKey, setDoneKey] = useState<string | null>(null);
  const [offlineSince, setOfflineSince] = useState<number | null>(null);
  const key = `${String(archived)}#${version}`;

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;
    Promise.all([fetchAllProducts(archived), apiGet<{ categories: CategoryDto[] }>('/categories')])
      .then(([p, c]) => {
        if (cancelled) return;
        setProducts(p);
        setCategories(c.categories);
        setError(null);
        setOfflineSince(null);
        // The device's copy for selling offline (Section 10): no costs, refreshed each load.
        if (!archived) {
          const snapshot: Snapshot = {
            products: p.map((x) => ({ ...x, costCents: null })),
            categories: c.categories,
            savedAt: Date.now(),
          };
          void kvSet(OFFLINE_KEY, snapshot);
        }
      })
      .catch(async (err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiClientError && err.status === 0 && !archived) {
          const snapshot = await kvGet<Snapshot>(OFFLINE_KEY);
          // (The screen may have closed while reading.)
          if (snapshot && !isCancelled()) {
            setProducts(snapshot.products);
            setCategories(snapshot.categories);
            setError(null);
            setOfflineSince(snapshot.savedAt);
            return;
          }
        }
        if (err instanceof ApiClientError && err.status === 401) {
          navigate('/login', { replace: true });
          return;
        }
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      })
      .finally(() => {
        if (!cancelled) setDoneKey(`${String(archived)}#${version}`);
      });
    return () => {
      cancelled = true;
    };
  }, [archived, version]);

  const reload = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);
  const replace = useCallback((product: ProductDto) => {
    setProducts((list) => list.map((p) => (p.id === product.id ? product : p)));
  }, []);

  return { products, categories, loading: doneKey !== key, error, reload, replace, offlineSince };
}

/** Lowercase, no accents: "Café" matches "cafe". */
export function searchKey(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}
