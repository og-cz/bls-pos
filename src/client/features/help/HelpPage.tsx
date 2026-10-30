import { useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, Compass, Search, SearchX } from 'lucide-react';

import { useMe } from '@/app/session';
import { EmptyState, PageHeader } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { navigate } from '@/lib/router';
import { hasRole } from '@shared/roles';

import { ARTICLES } from './articles';
import { Markdown } from './Markdown';

/** Help center (Section 8.3): short articles for this role, search, and the tour again. */
export function HelpPage() {
  const { user } = useMe();
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const isAdmin = hasRole(user.role, 'admin');

  const mine = useMemo(() => ARTICLES.filter((a) => hasRole(user.role, a.minRole)), [user.role]);
  const q = query.trim().toLowerCase();
  const shown = q
    ? mine.filter((a) => `${a.title} ${a.summary} ${a.body}`.toLowerCase().includes(q))
    : mine;
  const open = mine.find((a) => a.id === openId);

  function replayTour() {
    const kind = isAdmin ? 'admin' : 'staff';
    navigate(isAdmin ? '/' : '/sell');
    // Let the screen render before pointing at it.
    setTimeout(() => {
      void import('@/features/tour/tours').then(({ startTour }) => {
        startTour(user.id, kind);
      });
    }, 600);
  }

  if (open) {
    return (
      <article className="max-w-2xl">
        <Button
          type="button"
          variant="ghost"
          className="-ml-3 mb-2"
          onClick={() => {
            setOpenId(null);
          }}
        >
          <ArrowLeft aria-hidden="true" />
          All help
        </Button>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">{open.title}</h1>
        <p className="mb-6 text-muted-foreground">{open.summary}</p>
        <Markdown source={open.body} />
      </article>
    );
  }

  return (
    <>
      <PageHeader title="Help" description="Short guides for everyday work in your shop." />
      <div className="max-w-2xl space-y-4">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-48 flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              placeholder="Search help"
              aria-label="Search help"
              className="pl-10"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
            />
          </div>
          <Button type="button" variant="outline" className="h-11" onClick={replayTour}>
            <Compass aria-hidden="true" />
            Take the tour again
          </Button>
        </div>

        {shown.length === 0 ? (
          <EmptyState icon={SearchX} title="Nothing found">
            Try another word, like &quot;stock&quot; or &quot;receipt&quot;.
          </EmptyState>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {shown.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => {
                    setOpenId(a.id);
                    window.scrollTo(0, 0);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none hover:bg-accent focus-visible:bg-accent"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{a.title}</span>
                    <span className="block text-sm text-muted-foreground">{a.summary}</span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
