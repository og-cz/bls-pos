import { DEFAULT_THEME, PRESETS, type Theme } from './theme';

export const BUSINESS_TYPES = [
  'cafe',
  'retail',
  'sari_sari',
  'salon',
  'food_stall',
  'other',
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

/** Starting theme per business type (Section 6.3 presets); changed later in Branding. */
const PRESET_BY_TYPE: Record<BusinessType, (typeof PRESETS)[number]['id']> = {
  cafe: 'cafe-mocha',
  retail: 'ocean-retail',
  sari_sari: 'fresh-market',
  salon: 'salon-blush',
  food_stall: 'sunset-food',
  other: 'ocean-retail',
};

export function defaultTheme(type: BusinessType): Theme {
  const preset = PRESETS.find((p) => p.id === PRESET_BY_TYPE[type]) ?? PRESETS[2];
  return { ...DEFAULT_THEME, brand: preset.brand, mode: preset.mode, presetId: preset.id };
}
