import { useEffect, useRef, useState } from 'react';

import { useMe, useUpdateMe } from '@/app/session';
import { apiPatch } from '@/lib/api';
import { applyShopTheme } from '@/lib/shop-theme';
import type { Theme } from '@shared/theme';

import { PresetGrid } from '../branding/PresetGrid';
import { ShopImages } from '../branding/ShopImages';
import { StepLayout, type StepProps } from './StepLayout';

/** Step 2: colors, logo and cover photo, all optional (more in Branding later). */
export function LookStep({ onNext, busy }: StepProps) {
  const { shop } = useMe();
  const updateMe = useUpdateMe();
  const [draft, setDraft] = useState<Theme>(shop.theme);
  const saved = useRef(shop.theme);

  // Preview the colors right away; put the saved ones back if leaving without saving.
  useEffect(() => {
    applyShopTheme(draft);
  }, [draft]);
  useEffect(() => {
    saved.current = shop.theme;
  }, [shop.theme]);
  useEffect(
    () => () => {
      applyShopTheme(saved.current);
    },
    [],
  );

  async function save() {
    if (JSON.stringify(draft) === JSON.stringify(shop.theme)) return;
    const { theme } = await apiPatch<{ theme: Theme }>('/shop/theme', draft);
    saved.current = theme;
    updateMe((me) => ({ ...me, shop: { ...me.shop, theme } }));
  }

  return (
    <StepLayout
      title="Make it yours"
      description="Pick your colors and add your logo. Skip anything you want to do later in Branding."
      busy={busy}
      next={() => {
        onNext(save);
      }}
    >
      <PresetGrid
        value={draft.presetId}
        onPick={(brand, presetId) => {
          setDraft((d) => ({ ...d, brand, presetId }));
        }}
      />
      <ShopImages
        overlay={draft.coverOverlay}
        onOverlay={(coverOverlay) => {
          setDraft((d) => ({ ...d, coverOverlay }));
        }}
      />
    </StepLayout>
  );
}
