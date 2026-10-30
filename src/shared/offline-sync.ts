// Sending sales made offline (Section 10). Plain functions over a small store interface,
// so the rules are tested without a browser: oldest first, stop when the connection is
// still down, and a sale the server refuses goes to "Needs review", never in the bin.

export type QueueItem = {
  key: string;
  body: Record<string, unknown>;
  createdAt: number;
  status: 'pending' | 'review';
  error: string | null;
};

export type SendResult = { ok: true } | { ok: false; status: number; message: string };

/** What to do with a sale after one attempt to send it. */
export type Outcome = 'sent' | 'review' | 'retry-later' | 'signed-out';

export function classify(result: SendResult): Outcome {
  if (result.ok) return 'sent';
  if (result.status === 0 || result.status === 429 || result.status >= 500) return 'retry-later';
  if (result.status === 401) return 'signed-out';
  // 400, 403, 404, 409 (out of stock, day closed…): sending again won't change it.
  return 'review';
}

export type QueueStore<T extends QueueItem> = {
  all: () => Promise<T[]>;
  put: (item: T) => Promise<void>;
  remove: (key: string) => Promise<void>;
};

export type SyncSummary = { sent: number; review: number; left: number; stopped: Outcome | null };

/**
 * Sends every pending sale, oldest first. The same idempotency key means a sale that
 * reached the server before (but whose answer was lost) comes back as a replay, not a
 * second sale. Stops at the first "try later" or "signed out" so order is kept.
 */
export async function syncQueue<T extends QueueItem>(
  store: QueueStore<T>,
  send: (body: Record<string, unknown>) => Promise<SendResult>,
): Promise<SyncSummary> {
  const items = (await store.all())
    .filter((i) => i.status === 'pending')
    .sort((a, b) => a.createdAt - b.createdAt);
  const summary: SyncSummary = { sent: 0, review: 0, left: items.length, stopped: null };
  for (const item of items) {
    const result = await send(item.body);
    const outcome = classify(result);
    if (outcome === 'sent') {
      await store.remove(item.key);
      summary.sent += 1;
      summary.left -= 1;
    } else if (outcome === 'review') {
      await store.put({
        ...item,
        status: 'review',
        error: result.ok ? null : result.message,
      });
      summary.review += 1;
      summary.left -= 1;
    } else {
      summary.stopped = outcome;
      break;
    }
  }
  return summary;
}
