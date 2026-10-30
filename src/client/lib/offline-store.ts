// The device's offline data (Section 10), in IndexedDB: a copy of what selling needs
// (the signed-in session and the product list, without costs) and sales waiting to be
// sent. Never reports or admin data. Everything here is removed on logout.

const DB_NAME = 'bls-offline';
const VERSION = 1;
const KV = 'kv';
const QUEUE = 'queue';

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV);
      if (!db.objectStoreNames.contains(QUEUE)) db.createObjectStore(QUEUE, { keyPath: 'key' });
    };
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      opening = null;
      reject(req.error ?? new Error('Offline storage is not available.'));
    };
  });
  return opening;
}

async function run<T>(
  store: string,
  mode: IDBTransactionMode,
  action: (s: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const req = action(db.transaction(store, mode).objectStore(store));
    req.onsuccess = () => {
      resolve(req.result as T);
    };
    req.onerror = () => {
      reject(req.error ?? new Error('Offline storage failed.'));
    };
  });
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  try {
    return await run<T | undefined>(KV, 'readonly', (s) => s.get(key));
  } catch {
    return undefined; // Private mode or storage blocked: just no offline copy.
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  try {
    await run(KV, 'readwrite', (s) => s.put(value, key));
  } catch {
    // Without storage the app still works online.
  }
}

/** A sale waiting to reach the server. */
export type QueuedSale = {
  /** The sale's idempotency key: sending it twice still makes one sale. */
  key: string;
  /** Exactly what POST /sales receives. */
  body: Record<string, unknown>;
  /** For the list on screen; the server re-prices from its own data. */
  totalCents: number;
  itemCount: number;
  createdAt: number;
  /** 'review' = the server refused it; a person must decide (never dropped silently). */
  status: 'pending' | 'review';
  error: string | null;
  userId: string;
};

export function queueAll(): Promise<QueuedSale[]> {
  return run<QueuedSale[]>(QUEUE, 'readonly', (s) => s.getAll()).then((rows) =>
    rows.sort((a, b) => a.createdAt - b.createdAt),
  );
}

export async function queuePut(sale: QueuedSale): Promise<void> {
  await run(QUEUE, 'readwrite', (s) => s.put(sale));
  notify();
}

export async function queueDelete(key: string): Promise<void> {
  await run(QUEUE, 'readwrite', (s) => s.delete(key));
  notify();
}

/** Removes every offline copy (logout). */
export async function clearOffline(): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([KV, QUEUE], 'readwrite');
      tx.objectStore(KV).clear();
      tx.objectStore(QUEUE).clear();
      tx.oncomplete = () => {
        resolve();
      };
      tx.onerror = () => {
        reject(tx.error ?? new Error('Could not clear offline data.'));
      };
    });
  } catch {
    // Nothing stored.
  }
  notify();
  // Cached product photos too (the service worker owns that cache).
  if ('serviceWorker' in navigator)
    navigator.serviceWorker.controller?.postMessage('clear-private');
}

// Screens that show the queue (status pill, Sales) listen for changes.
const listeners = new Set<() => void>();
function notify() {
  for (const l of listeners) l();
}
export function onQueueChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
