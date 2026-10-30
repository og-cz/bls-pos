import { themeCss, type Theme } from '@shared/theme';

const STYLE_ID = 'shop-theme';

/** Paints the app in the shop's colors (Section 6.2); `null` goes back to the bls default. */
export function applyShopTheme(theme: Theme | null): void {
  let el = document.getElementById(STYLE_ID);
  if (!theme) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.append(el);
  }
  el.textContent = themeCss(theme);
}
