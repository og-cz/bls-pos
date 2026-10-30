import { themeCss, type Theme } from '@shared/theme';

import { setShopMode } from './preferences';

const STYLE_ID = 'shop-theme';

// Each font downloads only when a shop uses it; Inter is always bundled.
const FONT_LOADERS: Record<Theme['font'], (() => Promise<unknown>) | null> = {
  inter: null,
  poppins: () =>
    Promise.all([
      import('@fontsource/poppins/400.css'),
      import('@fontsource/poppins/500.css'),
      import('@fontsource/poppins/600.css'),
      import('@fontsource/poppins/700.css'),
    ]),
  'dm-sans': () => import('@fontsource-variable/dm-sans/index.css'),
  lora: () => import('@fontsource-variable/lora/index.css'),
  'space-grotesk': () => import('@fontsource-variable/space-grotesk/index.css'),
};

/** Paints the app in the shop's colors, font and corners (Section 6.2); `null` = bls default. */
export function applyShopTheme(theme: Theme | null): void {
  let el = document.getElementById(STYLE_ID);
  setShopMode(theme?.mode ?? 'system');
  if (!theme) {
    el?.remove();
    return;
  }
  void FONT_LOADERS[theme.font]?.();
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.append(el);
  }
  el.textContent = themeCss(theme);
}
