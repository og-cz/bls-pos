import { useState } from 'react';
import { Check, ExternalLink, Globe } from 'lucide-react';

import { useUpdateMe } from '@/app/session';
import { PageHeader } from '@/components/empty-state';
import { FormAlert, TextField } from '@/components/field';
import { Link } from '@/components/link';
import { Button } from '@/components/ui/button';
import { apiPatch } from '@/lib/api';
import { useApiGet } from '@/lib/use-api';
import { cn } from '@/lib/utils';
import { BIO_MAX, type ShopSettings } from '@shared/schemas/shop';

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={cn(
        'flex min-h-11 cursor-pointer items-start justify-between gap-4 py-2',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span className="text-sm">
        <span className="font-medium">{label}</span>
        <span className="block text-muted-foreground">{hint}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.checked);
        }}
      />
      <span
        aria-hidden="true"
        className={cn(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50',
          checked ? 'bg-primary' : 'bg-input',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-5',
          )}
        />
      </span>
    </label>
  );
}

function Form({ initial }: { initial: ShopSettings }) {
  const updateMe = useUpdateMe();
  const [saved, setSaved] = useState(initial);
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const dirty = JSON.stringify(values) !== JSON.stringify(saved);
  const set = <K extends keyof ShopSettings>(k: K, v: ShopSettings[K]) => {
    setDone(false);
    setValues((x) => ({ ...x, [k]: v }));
  };

  function save() {
    setBusy(true);
    setError(null);
    apiPatch<{ shop: ShopSettings }>('/shop', {
      name: values.name.trim(),
      bio: values.bio ?? '',
      storefrontEnabled: values.storefrontEnabled,
      storefrontShowPrices: values.storefrontShowPrices,
      storefrontShowStock: values.storefrontShowStock,
    })
      .then(({ shop }) => {
        setSaved(shop);
        setValues(shop);
        setDone(true);
        updateMe((me) => ({ ...me, shop: { ...me.shop, name: shop.name } }));
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not save.');
      })
      .finally(() => {
        setBusy(false);
      });
  }

  const pagePath = `/s/${saved.slug}`;
  return (
    <form
      className="max-w-2xl space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <section className="space-y-1 rounded-xl border bg-card p-4">
        <Toggle
          label="Public shop page"
          hint="A page anyone with the link can see: your cover, logo, description and products."
          checked={values.storefrontEnabled}
          onChange={(v) => {
            set('storefrontEnabled', v);
          }}
        />
        <div className="divide-y border-t">
          <Toggle
            label="Show prices"
            hint="Each product's selling price."
            checked={values.storefrontShowPrices}
            disabled={!values.storefrontEnabled}
            onChange={(v) => {
              set('storefrontShowPrices', v);
            }}
          />
          <Toggle
            label="Show availability"
            hint={'"Available" or "Sold out". The exact count is never shown.'}
            checked={values.storefrontShowStock}
            disabled={!values.storefrontEnabled}
            onChange={(v) => {
              set('storefrontShowStock', v);
            }}
          />
        </div>
        {saved.storefrontEnabled ? (
          <Link
            href={pagePath}
            className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Open your page <ExternalLink className="size-4" aria-hidden="true" />
          </Link>
        ) : null}
      </section>

      <section className="space-y-4 rounded-xl border bg-card p-4">
        <TextField
          label="Shop name"
          value={values.name}
          maxLength={80}
          required
          onChange={(e) => {
            set('name', e.target.value);
          }}
        />
        <div className="space-y-2">
          <label htmlFor="shop-bio" className="text-sm font-medium">
            Description
          </label>
          <textarea
            id="shop-bio"
            rows={4}
            maxLength={BIO_MAX}
            value={values.bio ?? ''}
            placeholder="What you sell, where you are, your opening hours…"
            onChange={(e) => {
              set('bio', e.target.value);
            }}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm"
          />
          <p className="text-xs text-muted-foreground tabular">
            {(values.bio ?? '').length}/{BIO_MAX}
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          Choose which products appear with &quot;Show on your shop page&quot; when editing a
          product.
        </p>
      </section>

      {error ? <FormAlert>{error}</FormAlert> : null}
      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={!dirty || busy || values.name.trim() === ''}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
        {done && !dirty ? (
          <span role="status" className="flex items-center gap-1 text-sm text-muted-foreground">
            <Check className="size-4" aria-hidden="true" /> Saved
          </span>
        ) : null}
      </div>
    </form>
  );
}

/** Shop page settings (Section 9): on/off, what it shows, the shop's description. */
export function ShopPageSettings() {
  const { data, error } = useApiGet<{ shop: ShopSettings }>('/shop');
  return (
    <>
      <PageHeader
        title="Shop page"
        description="Your shop's public page, to share with customers."
      />
      {error ? <FormAlert>{error}</FormAlert> : null}
      {data ? (
        <Form initial={data.shop} />
      ) : error ? null : (
        <p role="status" className="flex items-center gap-2 text-muted-foreground">
          <Globe className="size-4" aria-hidden="true" /> Loading…
        </p>
      )}
    </>
  );
}
