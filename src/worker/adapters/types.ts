// Outside services sit behind these interfaces (Section 2.3). Free ships one
// implementation of each; Paid editions add more without touching core POS logic.

export type StoredObject = { body: ReadableStream; contentType: string; size: number };

export interface StorageAdapter {
  put(key: string, data: ArrayBuffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
  /** Total bytes stored under a prefix, e.g. one shop's images (for maxImagesMB). */
  usedBytes(prefix: string): Promise<number>;
}
