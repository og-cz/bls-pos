import { z } from 'zod';

import { plainText } from './common';

export const BIO_MAX = 300;

/** Shop details and public page settings an admin may change (Section 5: PATCH /shop). */
export const shopSettingsSchema = z
  .object({
    name: plainText(80).optional(),
    // Plain text; line breaks allowed, other control characters not.
    bio: z
      .string()
      .trim()
      .max(BIO_MAX, `Use at most ${BIO_MAX} characters.`)
      .refine(
        (s) => !/\p{Cc}/u.test(s.replace(/\n/g, '')),
        'Contains characters that are not allowed.',
      )
      .optional(),
    storefrontEnabled: z.boolean().optional(),
    storefrontShowPrices: z.boolean().optional(),
    storefrontShowStock: z.boolean().optional(),
  })
  .strict();
export type ShopSettingsInput = z.infer<typeof shopSettingsSchema>;

export type ShopSettings = {
  slug: string;
  name: string;
  bio: string | null;
  storefrontEnabled: boolean;
  storefrontShowPrices: boolean;
  storefrontShowStock: boolean;
};
