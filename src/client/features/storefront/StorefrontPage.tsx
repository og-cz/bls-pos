import { useEffect, useState } from 'react';
import { Check, ImageOff, Share2, Store } from 'lucide-react';

import { BrandLogo } from '@/components/brand-logo';
import { Button } from '@/components/ui/button';
import { ApiClientError, apiGet } from '@/lib/api';
import { applyShopTheme } from '@/lib/shop-theme';
import { cn } from '@/lib/utils';
import { APP_NAME } from '@shared/app';
import { BUSINESS_LABEL } from '@shared/business';
import { formatCents } from '@shared/money';
import type { Storefront } from '@shared/schemas/storefront';

/** Shares this page through the phone's share sheet, or copies the link. */
function ShareButton({ name }: { name: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        const url = location.href;
        if (typeof navigator.share === 'function') {
          navigator.share({ title: name, url }).catch(() => {
            // Closed without sharing.
          });
        } else {
          void navigator.clipboard.writeText(url).then(() => {
            setCopied(true);
            setTimeout(() => {
              setCopied(false);
            }, 2000);
          });
        }
      }}
    >
      {copied ? <Check aria-hidden="true" /> : <Share2 aria-hidden="true" />}
      {copied ? 'Link copied' : 'Share'}
    </Button>
  );
}

type State =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ready'; storefront: Storefront };

/**
 * A shop's public page (Section 9), at /s/<shop code>. No sign-in. In the shop's own
 * colors and font; shows only what the shop chose to share.
 */
export function StorefrontPage({ slug }: { slug: string }) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    apiGet<{ storefront: Storefront }>(`/public/s/${encodeURIComponent(slug)}`)
      .then(({ storefront }) => {
        if (cancelled) return;
        setState({ status: 'ready', storefront });
        applyShopTheme(storefront.theme);
        document.title = storefront.name;
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiClientError && err.status === 404) setState({ status: 'missing' });
        else
          setState({ status: 'error', message: err instanceof Error ? err.message : 'Try again.' });
      });
    return () => {
      cancelled = true;
      applyShopTheme(null);
    };
  }, [slug]);

  if (state.status !== 'ready') {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
        {state.status === 'loading' ? (
          <p role="status" className="text-muted-foreground">
            Loading…
          </p>
        ) : (
          <>
            <Store className="size-10 text-muted-foreground" aria-hidden="true" />
            <h1 className="text-xl font-semibold">
              {state.status === 'missing'
                ? 'This shop page is not available'
                : 'Something went wrong'}
            </h1>
            <p className="text-muted-foreground">
              {state.status === 'missing'
                ? 'Check the link, or ask the shop to turn on its page.'
                : state.message}
            </p>
          </>
        )}
      </main>
    );
  }

  const s = state.storefront;
  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto max-w-5xl md:px-4 md:pt-4">
        <div className="relative aspect-[16/7] overflow-hidden bg-primary sm:aspect-[16/5] md:rounded-xl">
          {s.coverUrl ? (
            <>
              <img src={s.coverUrl} alt="" className="absolute inset-0 size-full object-cover" />
              <div
                className="absolute inset-0 bg-black"
                style={{ opacity: s.theme.coverOverlay }}
              />
            </>
          ) : null}
        </div>
        <div className="relative px-4 md:px-6">
          <div className="-mt-10 flex size-20 items-center justify-center overflow-hidden rounded-full border-4 border-background bg-card shadow sm:-mt-12 sm:size-24">
            {s.logoUrl ? (
              <img src={s.logoUrl} alt={`${s.name} logo`} className="size-full object-cover" />
            ) : (
              <Store className="size-8 text-muted-foreground" aria-hidden="true" />
            )}
          </div>
          <div className="absolute top-3 right-4 md:right-6">
            <ShareButton name={s.name} />
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{s.name}</h1>
          {s.businessType === 'other' ? null : (
            <p className="text-sm text-muted-foreground">{BUSINESS_LABEL[s.businessType]}</p>
          )}
          {s.bio ? <p className="mt-3 max-w-2xl whitespace-pre-line">{s.bio}</p> : null}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 md:px-6">
        {s.products.length > 0 ? (
          <>
            <h2 className="mb-4 text-lg font-semibold">Products</h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {s.products.map((p) => (
                <li key={p.id} className="overflow-hidden rounded-xl border bg-card">
                  <div className="flex aspect-[4/3] items-center justify-center bg-muted">
                    {(p.thumbUrl ?? p.imageUrl) ? (
                      <img
                        src={p.thumbUrl ?? p.imageUrl ?? ''}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                        onError={(e) => {
                          // Older photos have no thumbnail: use the full photo.
                          if (
                            p.imageUrl &&
                            e.currentTarget.src !== new URL(p.imageUrl, location.href).href
                          ) {
                            e.currentTarget.src = p.imageUrl;
                          }
                        }}
                      />
                    ) : (
                      <ImageOff className="size-6 text-muted-foreground" aria-hidden="true" />
                    )}
                  </div>
                  <div className="space-y-1 p-3">
                    <div className="line-clamp-2 font-medium">{p.name}</div>
                    {p.priceCents !== null ? (
                      <div className="font-semibold text-link tabular">
                        {formatCents(p.priceCents, s.currency)}
                      </div>
                    ) : null}
                    {p.available !== null ? (
                      <div
                        className={cn(
                          'text-xs font-medium',
                          p.available
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-muted-foreground',
                        )}
                      >
                        {p.available ? 'Available' : 'Sold out'}
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </main>

      <footer className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
        <BrandLogo decorative className="size-4" />
        Made with {APP_NAME}
      </footer>
    </div>
  );
}
