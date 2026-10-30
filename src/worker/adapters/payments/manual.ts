import type { PaymentAdapter } from '../types';

/**
 * Paid some other way the cashier confirms by hand (e.g. GCash sent to the shop's phone),
 * with an optional reference such as the transaction number. No provider is contacted.
 */
export const manualPayment: PaymentAdapter = {
  id: 'other_manual',
  label: 'Other (manual)',
  createPayment({ reference }) {
    return Promise.resolve({ status: 'paid', reference });
  },
};
