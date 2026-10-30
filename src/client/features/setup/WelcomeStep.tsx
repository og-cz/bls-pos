import { useState } from 'react';
import { Check } from 'lucide-react';

import { useMe, useUpdateMe } from '@/app/session';
import { TextField } from '@/components/field';
import { apiPatch } from '@/lib/api';
import { cn } from '@/lib/utils';
import { BUSINESS_LABEL, BUSINESS_TYPES, defaultTheme, type BusinessType } from '@shared/business';
import type { ShopSettings } from '@shared/schemas/shop';
import type { Theme } from '@shared/theme';

import { StepLayout, type StepProps } from './StepLayout';

/** Step 1: the shop's name and type. A new type also brings its suggested colors. */
export function WelcomeStep({ onNext, busy }: StepProps) {
  const { shop } = useMe();
  const updateMe = useUpdateMe();
  const [name, setName] = useState(shop.name);
  const [type, setType] = useState<BusinessType>(shop.businessType);

  async function save() {
    const { shop: saved } = await apiPatch<{ shop: ShopSettings }>('/shop', {
      name: name.trim(),
      businessType: type,
    });
    // Colors still at the old type's suggestion follow the new type; chosen ones stay.
    let theme = shop.theme;
    if (
      type !== shop.businessType &&
      shop.theme.presetId === defaultTheme(shop.businessType).presetId
    ) {
      theme = (await apiPatch<{ theme: Theme }>('/shop/theme', defaultTheme(type))).theme;
    }
    updateMe((me) => ({
      ...me,
      shop: { ...me.shop, name: saved.name, businessType: saved.businessType, theme },
    }));
  }

  return (
    <StepLayout
      title="Welcome to your shop"
      description="Check your shop's name and tell us what you sell. You can change these later."
      busy={busy}
      nextDisabled={name.trim() === ''}
      next={() => {
        onNext(save);
      }}
    >
      <TextField
        label="Shop name"
        value={name}
        maxLength={80}
        onChange={(e) => {
          setName(e.target.value);
        }}
      />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">What kind of shop is it?</legend>
        <div
          role="radiogroup"
          aria-label="Kind of shop"
          className="grid grid-cols-2 gap-2 sm:grid-cols-3"
        >
          {BUSINESS_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              onClick={() => {
                setType(t);
              }}
              className={cn(
                'flex min-h-11 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                type === t ? 'border-primary bg-primary/10 font-medium' : 'hover:bg-accent',
              )}
            >
              {BUSINESS_LABEL[t]}
              {type === t ? <Check className="size-4 text-primary" aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      </fieldset>
    </StepLayout>
  );
}
