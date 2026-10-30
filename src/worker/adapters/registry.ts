import { entitlementsFor } from '@shared/entitlements';

import { cashPayment } from './payments/cash';
import { manualPayment } from './payments/manual';
import type { PaymentAdapter } from './types';

const PAYMENTS: Record<string, PaymentAdapter> = {
  [cashPayment.id]: cashPayment,
  [manualPayment.id]: manualPayment,
};

/**
 * The payment adapter for a method, if the shop's plan allows it (Section 2.3). Paid
 * editions register more adapters here without touching the sales code.
 */
export function paymentAdapterFor(plan: string, method: string): PaymentAdapter | null {
  if (!entitlementsFor(plan).paymentMethods.includes(method)) return null;
  return PAYMENTS[method] ?? null;
}
