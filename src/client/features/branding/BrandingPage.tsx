import { useEffect, useRef, useState } from 'react';
import { HexColorPicker } from 'react-colorful';
import { Check, Info, RotateCcw, ShoppingCart } from 'lucide-react';

import { useMe, useUpdateMe } from '@/app/session';
import { PageHeader } from '@/components/empty-state';
import { FormAlert } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiPatch } from '@/lib/api';
import { applyShopTheme } from '@/lib/shop-theme';
import { dominantColors } from '@/lib/logo-colors';
import { cn } from '@/lib/utils';
import { formatCents } from '@shared/money';
import { LookSettings } from './LookSettings';
import { PresetGrid } from './PresetGrid';
import { ShopImages } from './ShopImages';
import { DEFAULT_THEME, HEX, resolvedColors, type Theme } from '@shared/theme';

type Tab = 'presets' | 'wheel' | 'logo';

/** What the shop will look like: a sell tile, the pay button, a card and the storefront. */
function Preview({ shopName, currency }: { shopName: string; currency: string }) {
  return (
    <div className="space-y-3" aria-label="Preview" role="img">
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="bg-primary px-4 py-6 text-primary-foreground">
          <div className="text-xs">Your shop page</div>
          <div className="text-lg font-semibold">{shopName}</div>
        </div>
        <div className="grid grid-cols-2 gap-2 p-3">
          {[
            ['Engine Oil 1L', 35_000],
            ['Spark Plug', 18_000],
          ].map(([name, price]) => (
            <div key={name} className="rounded-lg border p-3">
              <div className="mb-2 h-10 rounded-md bg-brand-100 dark:bg-brand-900" />
              <div className="text-sm font-medium">{name}</div>
              <div className="text-sm font-semibold text-primary tabular">
                {formatCents(Number(price), currency)}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 font-medium text-primary-foreground">
          <ShoppingCart className="size-4" aria-hidden="true" />
          Charge {formatCents(53_000, currency)}
        </span>
        <span className="inline-flex h-11 items-center rounded-lg border px-4 font-medium">
          Cancel
        </span>
      </div>
      <div className="flex gap-1">
        {([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const).map((s) => (
          <span
            key={s}
            className="h-6 flex-1 rounded-sm"
            style={{ background: `var(--brand-${String(s)})` }}
            title={String(s)}
          />
        ))}
      </div>
    </div>
  );
}

/** The logo's main colors, one tap each (Section 6.4 "Pick from logo"). */
function LogoColors({
  url,
  current,
  onPick,
}: {
  url: string;
  current: string;
  onPick: (hex: string) => void;
}) {
  const [colors, setColors] = useState<{ url: string; list: string[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    dominantColors(url)
      .then((list) => {
        if (!cancelled) setColors({ url, list });
      })
      .catch(() => {
        if (!cancelled) setColors({ url, list: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [url]);
  if (colors?.url !== url) {
    return <p className="text-sm text-muted-foreground">Reading your logo&apos;s colors…</p>;
  }
  if (colors.list.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No clear colors found in your logo. Try a preset or the color wheel.
      </p>
    );
  }
  return (
    <div role="radiogroup" aria-label="Colors from your logo" className="flex flex-wrap gap-3">
      {colors.list.map((hex) => (
        <button
          key={hex}
          type="button"
          role="radio"
          aria-checked={current === hex}
          aria-label={hex}
          onClick={() => {
            onPick(hex);
          }}
          className={cn(
            'flex size-14 items-center justify-center rounded-full border-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
            current === hex ? 'border-foreground' : 'border-transparent',
          )}
          style={{ background: hex }}
        >
          {current === hex ? <Check className="size-5 text-white" aria-hidden="true" /> : null}
        </button>
      ))}
    </div>
  );
}

/**
 * Branding (Section 6.4): pick a preset or any color, see the whole app change at once,
 * then save. Leaving without saving puts the saved colors back.
 */
export function BrandingPage() {
  const { shop } = useMe();
  const updateMe = useUpdateMe();
  const [draft, setDraft] = useState<Theme>(shop.theme);
  const [hexText, setHexText] = useState(shop.theme.brand);
  const [tab, setTab] = useState<Tab>(shop.theme.presetId ? 'presets' : 'wheel');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Live preview across the whole app; the saved theme comes back on the way out.
  useEffect(() => {
    applyShopTheme(draft);
  }, [draft]);
  const savedTheme = useRef(shop.theme);
  useEffect(() => {
    savedTheme.current = shop.theme;
  }, [shop.theme]);
  useEffect(
    () => () => {
      applyShopTheme(savedTheme.current);
    },
    [],
  );

  const dirty = JSON.stringify(draft) !== JSON.stringify(shop.theme);
  const { adjusted } = resolvedColors(draft);

  function pick(brand: string, presetId?: string) {
    setSaved(false);
    setHexText(brand.toUpperCase());
    setDraft((d) => {
      const next: Theme = { ...d, brand: brand.toUpperCase() };
      if (presetId) next.presetId = presetId;
      else delete next.presetId;
      return next;
    });
  }

  function save() {
    setBusy(true);
    setError(null);
    apiPatch<{ theme: Theme }>('/shop/theme', draft)
      .then(({ theme }) => {
        updateMe((me) => ({ ...me, shop: { ...me.shop, theme } }));
        setSaved(true);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not save the colors.');
      })
      .finally(() => {
        setBusy(false);
      });
  }

  return (
    <>
      <PageHeader
        title="Branding"
        description="Your shop's colors, on every screen and your shop page."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section className="space-y-4 rounded-xl border bg-card p-4">
          <div role="tablist" aria-label="Color" className="inline-flex rounded-lg border p-0.5">
            {(
              [
                ['presets', 'Presets'],
                ['wheel', 'Color wheel'],
                ...(shop.logoUrl ? ([['logo', 'From logo']] as const) : []),
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => {
                  setTab(id);
                }}
                className={cn(
                  'h-10 rounded-md px-4 text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  tab === id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'logo' && shop.logoUrl ? (
            <LogoColors url={shop.logoUrl} current={draft.brand} onPick={pick} />
          ) : tab === 'presets' ? (
            <PresetGrid value={draft.presetId} onPick={pick} />
          ) : (
            <div className="space-y-3">
              <HexColorPicker
                color={draft.brand}
                onChange={(c) => {
                  pick(c);
                }}
                className="!w-full max-w-sm"
              />
              <div className="flex max-w-sm items-center gap-2">
                <span
                  className="size-11 shrink-0 rounded-lg border"
                  style={{ background: draft.brand }}
                  aria-hidden="true"
                />
                <Input
                  aria-label="Color code"
                  value={hexText}
                  maxLength={7}
                  spellCheck={false}
                  className="font-mono uppercase"
                  onChange={(e) => {
                    const v = e.target.value.startsWith('#')
                      ? e.target.value
                      : `#${e.target.value}`;
                    setHexText(v);
                    if (HEX.test(v)) pick(v);
                  }}
                />
              </div>
            </div>
          )}

          {adjusted ? (
            <p className="flex items-start gap-2 rounded-lg bg-muted p-3 text-sm">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              We adjusted your color slightly so text on it stays readable.
            </p>
          ) : null}
          {error ? <FormAlert>{error}</FormAlert> : null}
        </section>

        <LookSettings
          theme={draft}
          onChange={(patch) => {
            setSaved(false);
            setDraft((d) => ({ ...d, ...patch }));
          }}
        />

        <ShopImages
          overlay={draft.coverOverlay}
          onOverlay={(coverOverlay) => {
            setSaved(false);
            setDraft((d) => ({ ...d, coverOverlay }));
          }}
        />

        <aside className="space-y-2 lg:col-start-2 lg:row-span-3 lg:row-start-1">
          <h2 className="text-sm font-medium text-muted-foreground">Preview</h2>
          <Preview shopName={shop.name} currency={shop.currency} />
        </aside>
      </div>
      {/* Always in reach: stays above the phone tab bar while scrolling. */}
      <div className="sticky bottom-20 z-30 mt-6 flex flex-wrap items-center gap-2 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur md:bottom-4">
        <Button type="button" size="lg" disabled={!dirty || busy} onClick={save}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
        <Button
          type="button"
          size="lg"
          variant="outline"
          disabled={busy}
          onClick={() => {
            setSaved(false);
            setHexText(DEFAULT_THEME.brand);
            setDraft(DEFAULT_THEME);
          }}
        >
          <RotateCcw aria-hidden="true" />
          Reset to default
        </Button>
        {saved && !dirty ? (
          <span role="status" className="flex items-center gap-1 text-sm text-muted-foreground">
            <Check className="size-4" aria-hidden="true" /> Saved
          </span>
        ) : null}
      </div>
    </>
  );
}
