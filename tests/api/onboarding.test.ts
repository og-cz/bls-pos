import { describe, expect, it } from 'vitest';

import { SETUP_FINISHED } from '../../src/shared/onboarding';
import { addMember, api, getWithCookie, signUp } from './helpers';

const patch = (cookie: string, path: string, body: unknown) =>
  api(path, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });

const shopOf = async (cookie: string) =>
  (
    await (
      await getWithCookie('/me', cookie)
    ).json<{
      shop: { onboardingStep: number; businessType: string; name: string };
    }>()
  ).shop;

describe('setup wizard', () => {
  it('a new shop starts at step 0 and resumes where it left off', async () => {
    const owner = await signUp();
    expect((await shopOf(owner.cookie)).onboardingStep).toBe(0);
    expect((await patch(owner.cookie, '/shop/onboarding', { step: 2 })).status).toBe(200);
    expect((await shopOf(owner.cookie)).onboardingStep).toBe(2);
    await patch(owner.cookie, '/shop/onboarding', { step: SETUP_FINISHED });
    expect((await shopOf(owner.cookie)).onboardingStep).toBe(SETUP_FINISHED);
  });

  it('the welcome step changes the name and kind of shop', async () => {
    const owner = await signUp();
    const res = await patch(owner.cookie, '/shop', { name: 'Moto Hub', businessType: 'retail' });
    expect(res.status).toBe(200);
    expect(await shopOf(owner.cookie)).toMatchObject({ name: 'Moto Hub', businessType: 'retail' });
    expect((await patch(owner.cookie, '/shop', { businessType: 'casino' })).status).toBe(400);
  });

  it('staff cannot move setup, and steps stay in range', async () => {
    const owner = await signUp();
    const staff = await addMember(owner, 'staff');
    expect((await patch(staff.cookie, '/shop/onboarding', { step: 3 })).status).toBe(403);
    for (const step of [-1, SETUP_FINISHED + 1, 1.5, '2']) {
      expect((await patch(owner.cookie, '/shop/onboarding', { step })).status).toBe(400);
    }
  });
});
