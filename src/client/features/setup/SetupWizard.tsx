import { useState } from 'react';
import { X } from 'lucide-react';

import { useMe, useUpdateMe } from '@/app/session';
import { BrandLogo } from '@/components/brand-logo';
import { FormAlert } from '@/components/field';
import { Button } from '@/components/ui/button';
import { apiPatch } from '@/lib/api';
import { navigate } from '@/lib/router';
import { SETUP_FINISHED, SETUP_STEPS } from '@shared/onboarding';

import { LookStep } from './LookStep';
import { StepLayout, type StepProps } from './StepLayout';
import { WelcomeStep } from './WelcomeStep';

/**
 * Setup after signup (Section 8.1): a few short steps, each skippable, resumed where the
 * owner left off (the shop's onboarding_step), so a new shop is selling in minutes.
 */
export function SetupWizard() {
  const { shop } = useMe();
  const updateMe = useUpdateMe();
  const step = Math.min(shop.onboardingStep, SETUP_STEPS.length - 1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function goTo(next: number) {
    await apiPatch('/shop/onboarding', { step: next });
    updateMe((me) => ({ ...me, shop: { ...me.shop, onboardingStep: next } }));
    if (next >= SETUP_FINISHED) navigate('/', { replace: true });
    window.scrollTo(0, 0);
  }

  function onNext(save?: () => Promise<void>) {
    setBusy(true);
    setError(null);
    (async () => {
      if (save) await save();
      await goTo(step + 1);
    })()
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      })
      .finally(() => {
        setBusy(false);
      });
  }

  const props: StepProps = { onNext, busy };
  const current = SETUP_STEPS[step];
  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
          <BrandLogo decorative className="size-7" />
          <div className="flex-1 text-sm text-muted-foreground">
            Step {step + 1} of {SETUP_STEPS.length}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              void goTo(SETUP_FINISHED);
            }}
          >
            <X aria-hidden="true" />
            Skip setup
          </Button>
        </div>
        <div className="h-1 bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${String(((step + 1) / SETUP_STEPS.length) * 100)}%` }}
          />
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8">
        {error ? (
          <div className="mb-4">
            <FormAlert>{error}</FormAlert>
          </div>
        ) : null}
        {current === 'welcome' ? <WelcomeStep {...props} /> : null}
        {current === 'look' ? <LookStep {...props} /> : null}
        {current !== 'welcome' && current !== 'look' ? (
          <StepLayout
            title="Almost there"
            description="The rest of setup is coming soon."
            next={() => {
              void goTo(SETUP_FINISHED);
            }}
            nextLabel="Go to my shop"
            busy={busy}
          >
            {null}
          </StepLayout>
        ) : null}
      </main>
    </div>
  );
}
