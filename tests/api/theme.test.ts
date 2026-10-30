import { describe, expect, it } from 'vitest';

import { defaultTheme } from '../../src/shared/business';
import {
  brandScale,
  hexToOklch,
  oklchToHex,
  parseTheme,
  PRESETS,
  SHADES,
  themeCss,
  themeSchema,
} from '../../src/shared/theme';
import { getWithCookie, signUp } from './helpers';

describe('theme schema', () => {
  it('accepts a valid theme and fills defaults', () => {
    expect(themeSchema.parse({ brand: '#1E6FD9' })).toMatchObject({
      mode: 'system',
      font: 'inter',
      radius: 'soft',
      coverOverlay: 0.35,
    });
  });

  it('refuses anything that could become raw CSS', () => {
    for (const brand of ['red', '#12345', '#1E6FD9; background:url(x)', 'var(--x)']) {
      expect(themeSchema.safeParse({ brand }).success).toBe(false);
    }
    expect(themeSchema.safeParse({ brand: '#1E6FD9', css: 'body{}' }).success).toBe(false);
    expect(themeSchema.safeParse({ brand: '#1E6FD9', coverOverlay: 0.9 }).success).toBe(false);
    expect(parseTheme({ brand: 'nope' }).brand).toBe('#1E6FD9');
  });

  it('every preset and business default is valid', () => {
    for (const p of PRESETS) expect(themeSchema.safeParse({ brand: p.brand }).success).toBe(true);
    expect(defaultTheme('cafe')).toMatchObject({ brand: '#8B5E3C', presetId: 'cafe-mocha' });
  });
});

describe('OKLCH palette', () => {
  it('round-trips hex through OKLCH', () => {
    for (const hex of ['#1E6FD9', '#8B5E3C', '#27272A', '#FFFFFF', '#000000', '#F06A27']) {
      expect(oklchToHex(hexToOklch(hex))).toBe(hex);
    }
    expect(hexToOklch('#FFFFFF').l).toBeCloseTo(1, 3);
  });

  it('makes 11 shades, light to dark, keeping the hue', () => {
    for (const p of PRESETS) {
      const scale = brandScale(p.brand);
      const ls = SHADES.map((s) => hexToOklch(scale[s]).l);
      for (let i = 1; i < ls.length; i++) expect(ls[i]).toBeLessThan(ls[i - 1] ?? 1);
      if (hexToOklch(p.brand).c > 0.05) {
        const hue = hexToOklch(p.brand).h;
        const diff = Math.abs(hexToOklch(scale[600]).h - hue);
        expect(Math.min(diff, 360 - diff)).toBeLessThan(6);
      }
    }
  });

  it('keeps very bright colors inside sRGB', () => {
    const scale = brandScale('#00FF00');
    for (const s of SHADES) expect(scale[s]).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('CSS contains only generated variables', () => {
    const css = themeCss(parseTheme({ brand: '#2E9E5B' }));
    expect(css).toContain('--brand-500: #');
    expect(css).toContain('--primary: #2E9E5B;');
    expect(css).not.toMatch(/url\(|@import|expression/);
  });
});

describe('/me theme', () => {
  it('returns the shop theme, validated', async () => {
    const owner = await signUp({ businessType: 'salon' });
    const me = await (
      await getWithCookie('/me', owner.cookie)
    ).json<{
      shop: { theme: { brand: string; presetId: string } };
    }>();
    expect(me.shop.theme).toMatchObject({ brand: '#C2577A', presetId: 'salon-blush' });
  });
});
