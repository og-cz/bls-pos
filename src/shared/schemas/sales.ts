import { z } from 'zod';

import { MAX_PRICE_CENTS } from './products';

export const MAX_SALE_LINES = 100;
export const MAX_QUANTITY = 10_000;

const cents = z
  .number()
  .int()
  .min(0)
  .max(MAX_PRICE_CENTS * 10);

/**
 * What the client may send for a sale (Section 5.3): product ids and quantities only.
 * Prices, totals and the sale number always come from the server.
 */
export const createSaleSchema = z
  .object({
    // A random id made on the device; the same key twice means the same sale (retries,
    // offline sync), never a second sale.
    idempotencyKey: z
      .string()
      .min(8)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/),
    items: z
      .array(
        z
          .object({
            productId: z.string().min(1).max(64),
            quantity: z.number().int().min(1).max(MAX_QUANTITY),
          })
          .strict(),
      )
      .min(1, 'The cart is empty.')
      .max(MAX_SALE_LINES),
    paymentMethod: z.string().min(1).max(32),
    paymentReference: z.string().trim().max(80).optional(),
    cashReceivedCents: cents.optional(),
    discountCents: cents.optional(),
    clientCreatedAt: z.number().int().min(0).optional(),
  })
  .strict();

export type CreateSaleInput = z.infer<typeof createSaleSchema>;

export type ReceiptLine = {
  productId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
};

export type Receipt = {
  id: string;
  number: number;
  status: 'completed' | 'voided';
  createdAt: number;
  cashier: { id: string; displayName: string };
  lines: ReceiptLine[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  paymentMethod: string;
  paymentReference: string | null;
  cashReceivedCents: number | null;
  changeCents: number | null;
  voidReason: string | null;
};

export const voidSaleSchema = z
  .object({ reason: z.string().trim().min(3, 'Say why, in a few words.').max(200) })
  .strict();
export type VoidSaleInput = z.infer<typeof voidSaleSchema>;
