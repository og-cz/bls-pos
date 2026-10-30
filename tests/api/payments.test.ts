import { describe, expect, it } from 'vitest';

import { paymentAdapterFor } from '../../src/worker/adapters/registry';

describe('payment adapters', () => {
  it('Free shops get cash and manual, recorded as paid at once', async () => {
    const cash = paymentAdapterFor('free', 'cash');
    const manual = paymentAdapterFor('free', 'other_manual');
    expect(cash?.label).toBe('Cash');
    expect(await cash?.createPayment({ saleId: 's', amountCents: 100, currency: 'PHP' })).toEqual({
      status: 'paid',
    });
    expect(
      await manual?.createPayment({
        saleId: 's',
        amountCents: 100,
        currency: 'PHP',
        reference: 'GC-1',
      }),
    ).toEqual({ status: 'paid', reference: 'GC-1' });
  });

  it('methods outside the plan have no adapter', () => {
    expect(paymentAdapterFor('free', 'card')).toBeNull();
    expect(paymentAdapterFor('pro', 'gcash')).toBeNull();
  });
});
