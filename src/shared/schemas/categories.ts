import { z } from 'zod';

import { plainText } from './common';

export const categorySchema = z
  .object({
    name: plainText(40),
    sortOrder: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();

export const updateCategorySchema = categorySchema
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change.');

export type CategoryInput = z.infer<typeof categorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CategoryDto = { id: string; name: string; sortOrder: number };
