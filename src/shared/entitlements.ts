// Plans and feature flags (Section 2.4). Only Free exists until Phase 11; every plan
// name falls back to Free, so an unknown or future plan never unlocks anything.
export type Plan = 'free' | 'pro' | 'business';

export type Entitlements = {
  maxProducts: number;
  /** Admins and staff together. The owner does not count. */
  maxStaff: number;
  maxImagesMB: number;
  paymentMethods: readonly string[];
  emailReceipts: boolean;
  multiBranch: boolean;
  aiInsights: boolean;
  customDomain: boolean;
  reportHistoryDays: number;
};

const FREE: Entitlements = {
  // Raised from 500 on 2026-10-30 (owner's call) so a whole catalog fits on day one.
  maxProducts: 5000,
  maxStaff: 5,
  maxImagesMB: 200,
  paymentMethods: ['cash', 'other_manual'],
  emailReceipts: false,
  multiBranch: false,
  aiInsights: false,
  customDomain: false,
  reportHistoryDays: 365,
};

// Pro and Business are defined in Phase 11.
export const ENTITLEMENTS: Record<'free', Entitlements> = { free: FREE };

export function entitlementsFor(plan: string): Entitlements {
  return plan === 'free' ? ENTITLEMENTS.free : FREE;
}

type Feature = {
  [K in keyof Entitlements]: Entitlements[K] extends boolean ? K : never;
}[keyof Entitlements];

/** The one place features are decided. Never scatter `plan === 'pro'` checks. */
export function can(shop: { plan: string }, feature: Feature): boolean {
  return entitlementsFor(shop.plan)[feature];
}
