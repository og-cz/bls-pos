import { describe, expect, it } from 'vitest';

import { defaultTheme } from '../../src/shared/business';
import {
  brandScale,
  contrastRatio,
  hexToOklch,
  oklchToHex,
  parseTheme,
  readableColor,
  resolvedColors,
  PRESETS,
  SHADES,
  themeCss,
  themeSchema,
} from '../../src/shared/theme';
import { env } from 'cloudflare:workers';
import { addMember, api, getWithCookie, signUp } from './helpers';

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

  it('sets the font and corners from the allowed lists only', () => {
    const css = themeCss(parseTheme({ brand: '#2E9E5B', font: 'lora', radius: 'round' }));
    expect(css).toContain("--shop-font: 'Lora Variable';");
    expect(css).toContain('--radius: 1.25rem;');
    expect(themeSchema.safeParse({ brand: '#2E9E5B', font: "x'; }" }).success).toBe(false);
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

describe('contrast guard', () => {
  it('measures WCAG contrast', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 1);
    expect(contrastRatio('#1E6FD9', '#FFFFFF')).toBeGreaterThan(4.5);
  });

  it('leaves good colors alone and picks the readable text', () => {
    expect(readableColor('#1E6FD9', 'light')).toEqual({
      color: '#1E6FD9',
      foreground: '#FFFFFF',
      adjusted: false,
    });
    // Orange: dark text reads better than white.
    expect(readableColor('#F06A27', 'light').foreground).toBe('#0A0A0A');
  });

  it('adjusts colors that would vanish, keeping them close', () => {
    for (const hex of ['#FFE600', '#F5F5F5', '#C8F7C5']) {
      const r = readableColor(hex, 'light');
      expect(r.adjusted).toBe(true);
      expect(contrastRatio(r.color, r.foreground)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(r.color, '#FFFFFF')).toBeGreaterThanOrEqual(3);
    }
    expect(readableColor('#27272A', 'dark').adjusted).toBe(true);
  });

  it('every preset and random colors pass in both modes', () => {
    const colors: string[] = PRESETS.map((p) => p.brand);
    for (let i = 0; i < 200; i++) {
      colors.push(
        `#${Math.floor(Math.random() * 0xffffff)
          .toString(16)
          .padStart(6, '0')}`,
      );
    }
    for (const brand of colors) {
      const { light, dark } = resolvedColors(parseTheme({ brand }));
      for (const r of [light, dark]) {
        expect(contrastRatio(r.color, r.foreground)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe('PATCH /shop/theme', () => {
  const patch = (cookie: string, body: unknown) =>
    api('/shop/theme', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    });

  it('admins save a theme; it comes back in /me and is logged', async () => {
    const owner = await signUp();
    const admin = await addMember(owner, 'admin');
    const res = await patch(admin.cookie, { brand: '#F06A27', presetId: 'sunset-food' });
    expect(res.status).toBe(200);
    const me = await (
      await getWithCookie('/me', owner.cookie)
    ).json<{
      shop: { theme: { brand: string; mode: string } };
    }>();
    expect(me.shop.theme).toMatchObject({ brand: '#F06A27', mode: 'system' });
    const log = await env.DB.prepare(
      "SELECT details_json AS d FROM audit_log WHERE shop_id = ? AND action = 'shop.theme'",
    )
      .bind(owner.shopId)
      .first<{ d: string }>();
    expect(JSON.parse(log?.d ?? '{}')).toMatchObject({ from: '#8B5E3C', to: '#F06A27' });
  });

  it('staff cannot, and bad or extra values are refused', async () => {
    const owner = await signUp();
    const staff = await addMember(owner, 'staff');
    expect((await patch(staff.cookie, { brand: '#F06A27' })).status).toBe(403);
    expect((await patch(owner.cookie, { brand: 'red' })).status).toBe(400);
    expect(
      (await patch(owner.cookie, { brand: '#F06A27', css: 'body{display:none}' })).status,
    ).toBe(400);
    expect((await patch(owner.cookie, { brand: '#F06A27', font: 'comic-sans' })).status).toBe(400);
  });

  it('only changes this shop', async () => {
    const a = await signUp();
    const b = await signUp();
    await patch(a.cookie, { brand: '#2E9E5B' });
    const me = await (
      await getWithCookie('/me', b.cookie)
    ).json<{ shop: { theme: { brand: string } } }>();
    expect(me.shop.theme.brand).toBe('#8B5E3C'); // the cafe default
  });
});

describe('logo and cover', () => {
  // A 1×1 PNG.
  const png = Uint8Array.from(
    atob(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    ),
    (ch) => ch.charCodeAt(0),
  );
  const upload = (cookie: string, kind: string) =>
    api(`/uploads/${kind}`, {
      method: 'POST',
      headers: { 'content-type': 'image/png', cookie },
      body: png,
    });
  const me = async (cookie: string) =>
    (
      await (
        await getWithCookie('/me', cookie)
      ).json<{
        shop: { logoUrl: string | null; coverUrl: string | null };
      }>()
    ).shop;

  it('uploads show in /me, and removing deletes them', async () => {
    const owner = await signUp();
    expect((await upload(owner.cookie, 'logo')).status).toBe(201);
    expect((await upload(owner.cookie, 'cover')).status).toBe(201);
    const shop = await me(owner.cookie);
    expect(shop.logoUrl).toMatch(/^\/api\/v1\/media\/shops\/.+\/logo\//);
    expect(shop.coverUrl).toMatch(/\/cover\//);

    const del = await api('/shop/logo', { method: 'DELETE', headers: { cookie: owner.cookie } });
    expect(del.status).toBe(200);
    expect((await me(owner.cookie)).logoUrl).toBeNull();
    const key = (shop.logoUrl ?? '').replace('/api/v1/media/', '');
    expect(await env.MEDIA.head(key)).toBeNull();
  });

  it('staff cannot change the logo', async () => {
    const owner = await signUp();
    const staff = await addMember(owner, 'staff');
    expect((await upload(staff.cookie, 'logo')).status).toBe(403);
    const del = await api('/shop/cover', { method: 'DELETE', headers: { cookie: staff.cookie } });
    expect(del.status).toBe(403);
  });
});
