import { z } from 'zod';

// Shop themes (Section 6.2). Only these validated values ever become CSS variables; no
// shop can inject its own CSS.

export const HEX = /^#[0-9a-fA-F]{6}$/;
export const FONTS = ['inter', 'poppins', 'dm-sans', 'lora', 'space-grotesk'] as const;
export const RADII = ['sharp', 'soft', 'round'] as const;
export const MODES = ['light', 'dark', 'system'] as const;

export const themeSchema = z
  .object({
    brand: z.string().regex(HEX, 'Use a color like #1E6FD9.'),
    accent: z.string().regex(HEX, 'Use a color like #1E6FD9.').optional(),
    mode: z.enum(MODES).default('system'),
    font: z.enum(FONTS).default('inter'),
    radius: z.enum(RADII).default('soft'),
    // Darkens the cover photo so text on it stays readable.
    coverOverlay: z.number().min(0).max(0.8).default(0.35),
    presetId: z.string().max(40).optional(),
  })
  .strict();

export type Theme = z.infer<typeof themeSchema>;

/** One-tap presets (Section 6.3). */
export const PRESETS = [
  { id: 'cafe-mocha', name: 'Café Mocha', brand: '#8B5E3C', mode: 'system' },
  { id: 'fresh-market', name: 'Fresh Market', brand: '#2E9E5B', mode: 'system' },
  { id: 'ocean-retail', name: 'Ocean Retail', brand: '#1E6FD9', mode: 'system' },
  { id: 'bubble-tea', name: 'Bubble Tea', brand: '#E5679B', mode: 'system' },
  { id: 'midnight-bar', name: 'Midnight Bar', brand: '#5B4BDB', mode: 'dark' },
  { id: 'sunset-food', name: 'Sunset Food', brand: '#F06A27', mode: 'system' },
  { id: 'salon-blush', name: 'Salon Blush', brand: '#C2577A', mode: 'system' },
  { id: 'classic-mono', name: 'Classic Mono', brand: '#27272A', mode: 'system' },
] as const satisfies readonly { id: string; name: string; brand: string; mode: Theme['mode'] }[];

export const DEFAULT_THEME: Theme = {
  brand: '#1E6FD9',
  mode: 'system',
  font: 'inter',
  radius: 'soft',
  coverOverlay: 0.35,
  presetId: 'ocean-retail',
};

/** A stored theme, or the default if it is missing or no longer valid. */
export function parseTheme(raw: unknown): Theme {
  const result = themeSchema.safeParse(raw);
  return result.success ? result.data : DEFAULT_THEME;
}

// ---- Color math: sRGB hex <-> OKLCH (Björn Ottosson's OKLab) ----

export type Oklch = { l: number; c: number; h: number };
type Rgb = [number, number, number];

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fromLinear = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

export function hexToRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  const to = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = hexToRgb(hex).map(toLinear) as Rgb;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.hypot(A, B);
  const h = c < 1e-4 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return { l: L, c, h };
}

/** Linear sRGB for an OKLCH color; may fall outside 0..1 (out of gamut). */
function oklchToLinear({ l: L, c, h }: Oklch): Rgb {
  const rad = (h * Math.PI) / 180;
  const A = c * Math.cos(rad);
  const B = c * Math.sin(rad);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb: Rgb) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** OKLCH to hex, lowering chroma (keeping lightness and hue) until it fits in sRGB. */
export function oklchToHex(color: Oklch): string {
  let lo = 0;
  let hi = color.c;
  if (!inGamut(oklchToLinear(color))) {
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToLinear({ ...color, c: mid }))) lo = mid;
      else hi = mid;
    }
    hi = lo;
  }
  return rgbToHex(oklchToLinear({ ...color, c: hi }).map(fromLinear) as Rgb);
}

export const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type Shade = (typeof SHADES)[number];

// Target lightness per shade; chroma eases off toward the very light and very dark ends.
const LIGHTNESS: Record<Shade, number> = {
  50: 0.975,
  100: 0.94,
  200: 0.885,
  300: 0.81,
  400: 0.72,
  500: 0.63,
  600: 0.545,
  700: 0.47,
  800: 0.395,
  900: 0.33,
  950: 0.25,
};
const CHROMA: Record<Shade, number> = {
  50: 0.15,
  100: 0.3,
  200: 0.5,
  300: 0.75,
  400: 0.95,
  500: 1,
  600: 1,
  700: 0.95,
  800: 0.85,
  900: 0.75,
  950: 0.6,
};

/** Shades 50–950 of the brand color, same hue, as hex. */
export function brandScale(brand: string): Record<Shade, string> {
  const base = hexToOklch(brand);
  const out = {} as Record<Shade, string>;
  for (const s of SHADES) {
    out[s] = oklchToHex({ l: LIGHTNESS[s], c: base.c * CHROMA[s], h: base.h });
  }
  return out;
}

// ---- Contrast (WCAG 2.2) ----

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Normal text needs 4.5:1; buttons, focus rings and icons need 3:1 against the page. */
export const TEXT_CONTRAST = 4.5;
export const UI_CONTRAST = 3;

export const LIGHT_TEXT = '#FFFFFF';
export const DARK_TEXT = '#0A0A0A';

// The app's surfaces (globals.css): the lightest and darkest a brand color sits on.
const SURFACES = {
  light: [oklchToHex({ l: 1, c: 0, h: 0 }), oklchToHex({ l: 0.967, c: 0, h: 0 })],
  dark: [oklchToHex({ l: 0.145, c: 0, h: 0 }), oklchToHex({ l: 0.205, c: 0, h: 0 })],
} as const;

/** White or near-black, whichever reads better on `bg`. */
export function textOn(bg: string): string {
  return contrastRatio(bg, LIGHT_TEXT) >= contrastRatio(bg, DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT;
}

function passes(color: string, mode: 'light' | 'dark'): boolean {
  return (
    contrastRatio(color, textOn(color)) >= TEXT_CONTRAST &&
    SURFACES[mode].every((surface) => contrastRatio(color, surface) >= UI_CONTRAST)
  );
}

export type ReadableColor = { color: string; foreground: string; adjusted: boolean };

/**
 * The brand color as a button: readable text on it (4.5:1) and visible against the
 * page (3:1). If it can't be, the lightness is moved the smallest step that works, the
 * hue kept, and `adjusted` says so ("We adjusted your color slightly…").
 */
export function readableColor(color: string, mode: 'light' | 'dark'): ReadableColor {
  if (passes(color, mode)) return { color, foreground: textOn(color), adjusted: false };
  const base = hexToOklch(color);
  for (let step = 0.01; step <= 1; step += 0.01) {
    for (const l of [base.l - step, base.l + step]) {
      if (l < 0 || l > 1) continue;
      const candidate = oklchToHex({ ...base, l });
      if (passes(candidate, mode)) {
        return { color: candidate, foreground: textOn(candidate), adjusted: true };
      }
    }
  }
  // Unreachable for sRGB colors; a safe fallback all the same.
  const fallback = mode === 'light' ? '#1E6FD9' : '#5C9DFF';
  return { color: fallback, foreground: textOn(fallback), adjusted: true };
}

/** What the theme will really use, per mode, and whether the color had to change. */
export function resolvedColors(theme: Theme) {
  const light = readableColor(theme.brand, 'light');
  const dark = readableColor(brandScale(theme.brand)[500], 'dark');
  return { light, dark, adjusted: light.adjusted };
}

/** The CSS font-family name of each font choice. */
export const FONT_FAMILY: Record<Theme['font'], string> = {
  inter: 'Inter Variable',
  poppins: 'Poppins',
  'dm-sans': 'DM Sans Variable',
  lora: 'Lora Variable',
  'space-grotesk': 'Space Grotesk Variable',
};

export const FONT_LABEL: Record<Theme['font'], string> = {
  inter: 'Inter',
  poppins: 'Poppins',
  'dm-sans': 'DM Sans',
  lora: 'Lora',
  'space-grotesk': 'Space Grotesk',
};

/** Corner roundness of cards, buttons and fields. */
export const RADIUS_REM: Record<Theme['radius'], number> = {
  sharp: 0.375,
  soft: 0.75,
  round: 1.25,
};

/**
 * The CSS that applies a shop's theme: the brand scale and the primary color for light
 * and dark mode. Built only from validated hex values, never from user text.
 */
export function themeCss(theme: Theme): string {
  const scale = brandScale(theme.brand);
  const vars = SHADES.map((s) => `--brand-${String(s)}: ${scale[s]};`).join(' ');
  const { light: l, dark: d } = resolvedColors(theme);
  const light = `--primary: ${l.color}; --ring: ${l.color}; --primary-foreground: ${l.foreground}; --link: ${scale[700]};`;
  const dark = `--primary: ${d.color}; --ring: ${d.color}; --primary-foreground: ${d.foreground}; --link: ${scale[300]};`;
  const look = `--shop-font: '${FONT_FAMILY[theme.font]}'; --radius: ${String(RADIUS_REM[theme.radius])}rem;`;
  return `:root { ${vars} ${light} ${look} }
.dark { ${dark} }`;
}
