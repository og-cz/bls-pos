import { describe, expect, it } from 'vitest';

import { can, entitlementsFor } from '../../src/shared/entitlements';
import { getWithCookie, signUp } from './helpers';

describe('entitlements', () => {
  it('gives Free shops the Free limits and no paid features', () => {
    expect(entitlementsFor('free')).toMatchObject({ maxStaff: 5, maxProducts: 5000 });
    expect(can({ plan: 'free' }, 'emailReceipts')).toBe(false);
    expect(can({ plan: 'free' }, 'multiBranch')).toBe(false);
  });

  it('treats unknown plans as Free, so nothing unlocks by accident', () => {
    expect(entitlementsFor('pro')).toEqual(entitlementsFor('free'));
    expect(can({ plan: 'business' }, 'aiInsights')).toBe(false);
    expect(entitlementsFor('made-up')).toEqual(entitlementsFor('free'));
  });

  it('are returned by /me', async () => {
    const { cookie } = await signUp();
    const me = await (await getWithCookie('/me', cookie)).json<{ entitlements: unknown }>();
    expect(me.entitlements).toMatchObject({
      maxStaff: 5,
      paymentMethods: ['cash', 'other_manual'],
    });
  });
});
