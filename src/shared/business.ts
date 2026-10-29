export const BUSINESS_TYPES = [
  'cafe',
  'retail',
  'sari_sari',
  'salon',
  'food_stall',
  'other',
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

/**
 * Starting theme per business type (master prompt §6.3 presets). Shops change it later in
 * Branding; the full ThemeSchema arrives in Phase 6.
 */
const PRESET_BY_TYPE: Record<BusinessType, { presetId: string; brand: string }> = {
  cafe: { presetId: 'cafe-mocha', brand: '#8B5E3C' },
  retail: { presetId: 'ocean-retail', brand: '#1E6FD9' },
  sari_sari: { presetId: 'fresh-market', brand: '#2E9E5B' },
  salon: { presetId: 'salon-blush', brand: '#C2577A' },
  food_stall: { presetId: 'sunset-food', brand: '#F06A27' },
  other: { presetId: 'ocean-retail', brand: '#1E6FD9' },
};

export function defaultTheme(type: BusinessType) {
  const preset = PRESET_BY_TYPE[type];
  return {
    brand: preset.brand,
    mode: 'system',
    font: 'inter',
    radius: 'soft',
    coverOverlay: 0.35,
    presetId: preset.presetId,
  } as const;
}
