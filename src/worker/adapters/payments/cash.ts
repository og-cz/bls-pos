import type { PaymentAdapter } from '../types';

/** Cash at the counter: paid on the spot; change is worked out by the sale itself. */
export const cashPayment: PaymentAdapter = {
  id: 'cash',
  label: 'Cash',
  createPayment() {
    return Promise.resolve({ status: 'paid' });
  },
};
