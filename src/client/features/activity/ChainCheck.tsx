import { useState } from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { apiGet } from '@/lib/api';
import {
  CHAIN_START,
  verifyChain,
  type ChainCheck as Result,
  type ChainEntry,
} from '@shared/audit-chain';

async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)),
  );
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

type Page = { entries: ChainEntry[]; unsealed: number };

/**
 * Checks that no sealed activity entry was changed or removed (Section 7.16). Runs in
 * this browser: it downloads the sealed entries and recomputes the hash chain, so even
 * someone with access to the server's database can't fake a pass without the history.
 */
export function ChainCheck() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<(Result & { unsealed: number }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      let prev = CHAIN_START;
      let after = 0;
      let checked = 0;
      let unsealed = 0;
      for (;;) {
        const page = await apiGet<Page>(`/audit/chain?after=${String(after)}`);
        unsealed = page.unsealed;
        const r = await verifyChain(sha256Hex, page.entries, prev, after + 1);
        if (!r.ok) {
          setResult({ ...r, checked: checked + r.checked, unsealed });
          return;
        }
        checked += r.checked;
        prev = r.head;
        const last = page.entries.at(-1);
        if (!last || page.entries.length < 500) break;
        after = last.chainSeq;
      }
      setResult({ ok: true, checked, head: prev, unsealed });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check the log.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-4 space-y-2 rounded-xl border bg-card p-4 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium">Is this log complete?</div>
          <div className="text-muted-foreground">
            Entries are sealed every hour. A check shows if any sealed entry was changed or removed.
          </div>
        </div>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void check()}>
          {busy ? 'Checking…' : 'Check the log'}
        </Button>
      </div>
      {result?.ok ? (
        <p role="status" className="flex items-start gap-2 text-emerald-700 dark:text-emerald-400">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            All {result.checked.toLocaleString()} sealed entries are intact.
            {result.unsealed
              ? ` ${String(result.unsealed)} newer ones are sealed within the hour.`
              : ''}{' '}
            <span className="font-mono text-xs text-muted-foreground">
              Fingerprint {result.head.slice(0, 16)}
            </span>
          </span>
        </p>
      ) : null}
      {result && !result.ok ? (
        <p role="alert" className="flex items-start gap-2 text-destructive">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {result.reason === 'missing'
            ? `Entry ${String(result.brokenAt)} is missing: entries were removed from the log.`
            : `Entry ${String(result.brokenAt)} was changed after it was recorded.`}{' '}
          Contact support and keep your backups.
        </p>
      ) : null}
      {error ? <p className="text-destructive">{error}</p> : null}
    </section>
  );
}
