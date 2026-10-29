import { z } from 'zod';

import { plainText } from './common';
import { MAX_STOCK } from './products';

// Reasons a person can pick when taking stock out (Section 1.1). Sales and voids move
// stock on their own; 'restock' and 'correction' are the other movement reasons.
export const DEDUCT_REASONS = ['damaged', 'expired', 'used', 'lost'] as const;
export type DeductReason = (typeof DEDUCT_REASONS)[number];

const quantity = z
  .number({ error: 'Enter a quantity.' })
  .int('Use a whole number.')
  .min(1, 'Enter at least 1.')
  .max(MAX_STOCK, 'That number is too large.');

const productId = z.string().min(1).max(64);
const note = plainText(200).optional();

export const restockSchema = z.object({ productId, quantity, note }).strict();

export const deductSchema = z
  .object({
    productId,
    quantity,
    reason: z.enum(DEDUCT_REASONS, { error: 'Pick a reason.' }),
    note,
  })
  .strict();

export const movementQuerySchema = z
  .object({
    productId: productId.optional(),
    cursor: z.string().max(64).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export type RestockInput = z.infer<typeof restockSchema>;
export type DeductInput = z.infer<typeof deductSchema>;
export type MovementQuery = z.infer<typeof movementQuerySchema>;

export type MovementDto = {
  id: string;
  product: { id: string; name: string };
  user: { id: string; displayName: string };
  delta: number;
  reason: string;
  note: string | null;
  createdAt: number;
};
