import { z } from 'zod';

import { BUSINESS_TYPES, type BusinessType } from '../business';
import { SETUP_FINISHED } from '../onboarding';
import { plainText } from './common';

export const BIO_MAX = 300;

/** Shop details and public page settings an admin may change (Section 5: PATCH /shop). */
export const shopSettingsSchema = z
  .object({
    name: plainText(80).optional(),
    businessType: z.enum(BUSINESS_TYPES).optional(),
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

export const onboardingSchema = z
  .object({ step: z.number().int().min(0).max(SETUP_FINISHED) })
  .strict();

export type ShopSettings = {
  slug: string;
  name: string;
  businessType: BusinessType;
  bio: string | null;
  storefrontEnabled: boolean;
  storefrontShowPrices: boolean;
  storefrontShowStock: boolean;
};

/** Deleting the shop: type its code and the owner's password, so it is never by accident. */
export const deleteShopSchema = z
  .object({
    shopSlug: z.string().trim().toLowerCase().min(1, 'Required.').max(40),
    password: z.string().min(1, 'Required.').max(128),
  })
  .strict();
export type DeleteShopInput = z.infer<typeof deleteShopSchema>;
