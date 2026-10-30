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

/** 'cash' and 'other_manual' in Free; online methods (GCash, Maya, cards) arrive in Paid. */
export type PaymentMethodId = string;

export interface PaymentAdapter {
  id: PaymentMethodId;
  label: string;
  /**
   * Free methods are recorded as paid at once. Paid editions may return 'pending' with a
   * provider reference to confirm later.
   */
  createPayment(input: {
    saleId: string;
    amountCents: number;
    currency: string;
    reference?: string | undefined;
  }): Promise<{ status: 'paid' | 'pending'; reference?: string | undefined }>;
}
