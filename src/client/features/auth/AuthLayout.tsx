import type { ReactNode } from 'react';

import { BrandLogo } from '@/components/brand-logo';
import { APP_NAME } from '@shared/app';

type Props = { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode };

/** Centered card with the app mark. Full width on phones, a 28rem card on bigger screens. */
export function AuthLayout({ title, description, children, footer }: Props) {
  return (
    <main className="flex min-h-dvh flex-col items-center px-4 py-8 sm:justify-center sm:py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2 print:hidden">
          <BrandLogo decorative className="size-16" />
          <span className="text-xl font-semibold tracking-tight">{APP_NAME}</span>
        </div>
        <div className="rounded-xl border bg-card p-6 text-card-foreground shadow-sm sm:p-8 print:border-0 print:p-0 print:shadow-none">
          <div className="mb-6 space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {description ? <p className="text-muted-foreground">{description}</p> : null}
          </div>
          {children}
        </div>
        {footer ? (
          <div className="mt-6 space-y-2 text-center text-sm text-muted-foreground print:hidden">
            {footer}
          </div>
        ) : null}
      </div>
    </main>
  );
}
