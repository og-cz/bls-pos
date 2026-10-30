import { z } from 'zod';

import { plainText } from './common';

// Money is integer centavos (Section 4). ₱1,000,000.00 is a generous ceiling for one item.
export const MAX_PRICE_CENTS = 100_000_000;
export const MAX_STOCK = 1_000_000;

const cents = z
  .number({ error: 'Enter an amount.' })
  .int('Use whole centavos.')
  .min(0, "Can't be negative.")
  .max(MAX_PRICE_CENTS, 'That amount is too large.');

const count = (label: string) =>
  z
    .number({ error: `Enter ${label}.` })
    .int('Use a whole number.')
    .min(0, "Can't be negative.")
    .max(MAX_STOCK, 'That number is too large.');

// Empty strings from forms mean "no SKU".
const sku = z
  .string()
  .trim()
  .max(40, 'Use at most 40 characters.')
  .regex(/^[A-Za-z0-9._\-/]*$/, 'Use letters, numbers, dots, dashes, slashes or underscores.')
  .transform((s) => (s === '' ? null : s))
  .nullable();

const id = z.string().min(1).max(64);

const productFields = {
  name: plainText(80),
  sku: sku.optional(),
  priceCents: cents,
  costCents: cents.nullable().optional(),
  categoryId: id.nullable().optional(),
  trackStock: z.boolean().optional(),
  lowStockThreshold: count('a number').optional(),
  showOnStorefront: z.boolean().optional(),
};

// Opening stock may be set once, when the product is created; after that, stock only
// changes through restocks, deductions and sales, so every change is logged.
export const createProductSchema = z
  .object({ ...productFields, stock: count('the stock').optional() })
  .strict();

export const updateProductSchema = z
  .object({
    ...productFields,
    name: productFields.name.optional(),
    priceCents: cents.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change.');

export const productQuerySchema = z
  .object({
    q: z.string().trim().max(80).optional(),
    categoryId: id.optional(),
    archived: z.enum(['true', 'false']).optional(),
    // 'low' = at or below its low-stock threshold (includes out of stock); 'out' = none left.
    stock: z.enum(['low', 'out']).optional(),
    cursor: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(100),
  })
  .strict();

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ProductQuery = z.infer<typeof productQuerySchema>;

/**
 * Badge for stock (Section 6.5: green / amber low / red out). Untracked items (e.g.
 * made-to-order drinks) have no badge.
 */
export type StockStatus = 'ok' | 'low' | 'out' | 'untracked';

export function stockStatus(p: {
  trackStock: boolean;
  stock: number;
  lowStockThreshold: number;
}): StockStatus {
  if (!p.trackStock) return 'untracked';
  if (p.stock <= 0) return 'out';
  return p.stock <= p.lowStockThreshold ? 'low' : 'ok';
}

/** A product as the API returns it. `costCents` is present only for admins and the owner. */
export type ProductDto = {
  id: string;
  name: string;
  sku: string | null;
  priceCents: number;
  costCents?: number | null;
  categoryId: string | null;
  trackStock: boolean;
  stock: number;
  lowStockThreshold: number;
  stockStatus: StockStatus;
  showOnStorefront: boolean;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
  /** Served by the API to signed-in members of the shop; null when there's no photo. */
  imageUrl: string | null;
  /** Small copy for lists. Photos from before thumbnails existed fall back to imageUrl. */
  thumbUrl: string | null;
};
