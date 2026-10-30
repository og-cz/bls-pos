import { useEffect, useSyncExternalStore } from 'react';

import { syncQueue, type SendResult, type SyncSummary } from '@shared/offline-sync';

import { ApiClientError, apiPost } from './api';
import { onQueueChange, queueAll, queueDelete, queuePut, type QueuedSale } from './offline-store';

// Sends this device's offline sales when the connection is back (Section 10).

let running: Promise<SyncSummary | null> | null = null;

async function send(body: Record<string, unknown>): Promise<SendResult> {
  try {
    await apiPost('/sales', body);
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiClientError) {
      return { ok: false, status: err.status, message: err.message };
    }
    return { ok: false, status: 0, message: 'No connection.' };
  }
}

/** One sync at a time; safe to call often. */
export function syncNow(userId: string): Promise<SyncSummary | null> {
  running ??= syncQueue<QueuedSale>(
    {
      // Only this person's sales: the server records a sale as whoever sends it.
      all: async () => (await queueAll()).filter((s) => s.userId === userId),
      put: queuePut,
      remove: queueDelete,
    },
    send,
  )
    .catch(() => null)
    .finally(() => {
      running = null;
    });
  return running;
}

/** Keeps syncing: at start, when the connection returns, and every 30 s while some wait. */
export function useBackgroundSync(userId: string) {
  useEffect(() => {
    const run = () => void syncNow(userId);
    run();
    window.addEventListener('online', run);
    const timer = setInterval(() => {
      if (navigator.onLine) {
        void queueAll().then((q) => {
          if (q.some((s) => s.status === 'pending')) run();
        });
      }
    }, 30_000);
    return () => {
      window.removeEventListener('online', run);
      clearInterval(timer);
    };
  }, [userId]);
}

// ---- Live views for the screen ----

let snapshot: QueuedSale[] = [];
let loaded = false;
function refresh(notifyAll: () => void) {
  void queueAll()
    .then((q) => {
      snapshot = q;
      loaded = true;
      notifyAll();
    })
    .catch(() => undefined);
}

function subscribe(callback: () => void) {
  if (!loaded) refresh(callback);
  return onQueueChange(() => {
    refresh(callback);
  });
}

/** The sales waiting on this device (pending and needs review), oldest first. */
export function useQueue(): QueuedSale[] {
  return useSyncExternalStore(subscribe, () => snapshot);
}

function subscribeOnline(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine);
}
