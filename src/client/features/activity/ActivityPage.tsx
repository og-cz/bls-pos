import { useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  KeyRound,
  Package,
  PackageMinus,
  PackagePlus,
  Pencil,
  LogIn,
  Lock,
  ShieldAlert,
  Store,
  Upload,
  Tag,
  UserMinus,
  UserPlus,
  ScrollText,
  type LucideIcon,
} from 'lucide-react';

import { EmptyState, PageHeader } from '@/components/empty-state';
import { FormAlert } from '@/components/field';
import { Button } from '@/components/ui/button';
import { apiGet } from '@/lib/api';
import { useApiGet } from '@/lib/use-api';
import { cn } from '@/lib/utils';
import type { AuditAction, AuditEntry } from '@shared/audit';

type Page = { entries: AuditEntry[]; nextCursor: string | null };

const ACTIONS: Record<AuditAction, { icon: LucideIcon; text: string; warn?: boolean }> = {
  'shop.create': { icon: Store, text: 'created the shop' },
  'login.success': { icon: LogIn, text: 'logged in' },
  'login.failed': { icon: ShieldAlert, text: 'failed to log in', warn: true },
  'login.locked': { icon: Lock, text: 'was locked out for 15 minutes', warn: true },
  'password.recover': { icon: KeyRound, text: 'reset the password with a recovery code' },
  'recover.failed': { icon: ShieldAlert, text: 'wrong recovery code entered', warn: true },
  'staff.create': { icon: UserPlus, text: 'added' },
  'staff.deactivate': { icon: UserMinus, text: 'deactivated' },
  'product.create': { icon: Package, text: 'added product' },
  'product.update': { icon: Pencil, text: 'edited product' },
  'product.import': { icon: Upload, text: 'imported products' },
  'product.archive': { icon: Archive, text: 'archived product' },
  'product.unarchive': { icon: ArchiveRestore, text: 'restored product' },
  'category.create': { icon: Tag, text: 'added category' },
  'category.update': { icon: Tag, text: 'renamed category' },
  'category.delete': { icon: Tag, text: 'removed category' },
  'stock.restock': { icon: PackagePlus, text: 'restocked' },
  'stock.deduct': { icon: PackageMinus, text: 'took out stock of' },
};

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function describe(entry: AuditEntry): string {
  const info = ACTIONS[entry.action];
  const who = entry.user?.displayName ?? 'Someone';
  const target = typeof entry.details?.username === 'string' ? `@${entry.details.username}` : '';
  switch (entry.action) {
    case 'staff.create':
    case 'staff.deactivate':
      return `${who} ${info.text} ${target}`.trim();
    case 'product.import': {
      const d = entry.details ?? {};
      const n = (k: string) => (typeof d[k] === 'number' ? d[k] : 0);
      return `${who} imported products: ${n('created')} added, ${n('updated')} updated`;
    }
    case 'product.create':
    case 'product.update':
    case 'product.archive':
    case 'product.unarchive':
    case 'category.create':
    case 'category.update':
    case 'category.delete':
    case 'stock.restock':
    case 'stock.deduct': {
      const name = typeof entry.details?.name === 'string' ? entry.details.name : '';
      return `${who} ${info.text} ${name}`.trim();
    }
    case 'login.failed':
    case 'login.locked':
    case 'recover.failed':
      // No signed-in actor: the target is the account someone tried.
      return entry.action === 'recover.failed'
        ? `Owner account: ${info.text}`
        : `${who === 'Someone' ? 'An account' : who} ${info.text}`;
    default:
      return `${who} ${info.text}`;
  }
}

/** Sensitive actions in this shop, newest first (Section 7.13). Owner and admins only. */
export function ActivityPage() {
  const first = useApiGet<Page>('/audit?limit=50');
  const [more, setMore] = useState<AuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  const entries = [...(first.data?.entries ?? []), ...more];
  const next = cursor === undefined ? (first.data?.nextCursor ?? null) : cursor;

  async function loadMore() {
    if (!next) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await apiGet<Page>(`/audit?limit=50&cursor=${encodeURIComponent(next)}`);
      setMore((m) => [...m, ...page.entries]);
      setCursor(page.nextCursor);
    } catch (err) {
      setMoreError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Activity"
        description="Logins, staff changes and other important actions in your shop."
      />
      {first.error ? <FormAlert>{first.error}</FormAlert> : null}
      {first.loading && !first.data ? (
        <p role="status" className="text-muted-foreground">
          Loading…
        </p>
      ) : null}
      {first.data && entries.length === 0 ? (
        <EmptyState icon={ScrollText} title="Nothing yet">
          Important actions will be listed here.
        </EmptyState>
      ) : null}

      {entries.length ? (
        <ol className="divide-y rounded-xl border bg-card">
          {entries.map((entry) => {
            const info = ACTIONS[entry.action];
            return (
              <li key={entry.id} className="flex items-start gap-3 px-4 py-3">
                <span
                  className={cn(
                    'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full',
                    info.warn ? 'bg-destructive/10 text-destructive' : 'bg-muted text-foreground',
                  )}
                  aria-hidden="true"
                >
                  <info.icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="font-medium">{describe(entry)}</p>
                  <p className="text-sm text-muted-foreground">
                    <time dateTime={new Date(entry.createdAt).toISOString()}>
                      {timeFormat.format(entry.createdAt)}
                    </time>
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}

      {moreError ? (
        <div className="mt-4">
          <FormAlert>{moreError}</FormAlert>
        </div>
      ) : null}
      {next ? (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Show older'}
          </Button>
        </div>
      ) : null}
    </>
  );
}
