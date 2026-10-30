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

const localDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');

/**
 * Listing sales. Admins pick any range and cashier; staff always get their own sales for
 * today (their shift), whatever they ask for. Paged newest first by sale number.
 */
export const saleListQuerySchema = z
  .object({
    from: localDay.optional(),
    to: localDay.optional(),
    userId: z.string().min(1).max(64).optional(),
    before: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict()
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: 'From must be on or before To.',
    path: ['to'],
  })
  .refine(
    (q) =>
      !q.from ||
      !q.to ||
      (Date.parse(`${q.to}T00:00:00Z`) - Date.parse(`${q.from}T00:00:00Z`)) / 86_400_000 < 366,
    { message: 'Pick at most 366 days.', path: ['to'] },
  );
export type SaleListQuery = z.infer<typeof saleListQuerySchema>;

export type SaleSummary = {
  id: string;
  number: number;
  status: 'completed' | 'voided';
  createdAt: number;
  totalCents: number;
  paymentMethod: string;
  itemCount: number;
  cashier: { id: string; displayName: string };
  voidReason: string | null;
};

export type SaleList = {
  from: string;
  to: string;
  sales: SaleSummary[];
  /** Pass as `before` for the next page; null on the last page. */
  nextBefore: number | null;
  /** For the whole range and filter, not just this page. */
  totals: { salesCount: number; grossCents: number; voidedCount: number; voidedCents: number };
};
