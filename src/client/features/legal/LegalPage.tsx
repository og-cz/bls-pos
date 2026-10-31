import { BrandLogo } from '@/components/brand-logo';
import { Link } from '@/components/link';
import { APP_NAME } from '@shared/app';

import { Markdown } from '../help/Markdown';
import { LEGAL_UPDATED, PRIVACY, TERMS } from './documents';

/** The privacy policy or terms, readable without logging in. */
export function LegalPage({ doc }: { doc: 'privacy' | 'terms' }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/login" className="mb-8 inline-flex items-center gap-2 font-semibold">
        <BrandLogo decorative className="size-7" />
        {APP_NAME}
      </Link>
      <h1 className="mb-1 text-3xl font-bold tracking-tight">
        {doc === 'privacy' ? 'Privacy policy' : 'Terms of use'}
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">Last updated {LEGAL_UPDATED}</p>
      <Markdown source={doc === 'privacy' ? PRIVACY : TERMS} />
      <p className="mt-10 text-sm text-muted-foreground">
        <Link
          href={doc === 'privacy' ? '/terms' : '/privacy'}
          className="text-link hover:underline"
        >
          {doc === 'privacy' ? 'Terms of use' : 'Privacy policy'}
        </Link>
      </p>
    </main>
  );
}

export function PrivacyPage() {
  return <LegalPage doc="privacy" />;
}

export function TermsPage() {
  return <LegalPage doc="terms" />;
}
