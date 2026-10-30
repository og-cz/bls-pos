import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';

export type StepProps = {
  /** Saves this step's work (if any), then moves to the next step. */
  onNext: (save?: () => Promise<void>) => void;
  busy: boolean;
};

/** The frame every step uses: title, text, content and the Next button. */
export function StepLayout({
  title,
  description,
  children,
  next,
  nextLabel = 'Continue',
  nextDisabled = false,
  busy,
  secondary,
}: {
  title: string;
  description: string;
  children: ReactNode;
  next: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  busy: boolean;
  secondary?: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
      {children}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {secondary}
        <Button type="button" size="lg" disabled={busy || nextDisabled} onClick={next}>
          {busy ? 'Saving…' : nextLabel}
        </Button>
      </div>
    </div>
  );
}
