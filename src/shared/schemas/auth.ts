import { z } from 'zod';

import { BUSINESS_TYPES } from '../business';
import { checkPassword, passwordProblemMessage } from '../password-policy';
import { isValidSlug } from '../slug';
import { plainText, usernameSchema } from './common';

export { USERNAME_PATTERN, usernameSchema } from './common';

export const shopSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine(isValidSlug, 'Use 3–40 lowercase letters, numbers or dashes. Some names are reserved.');

// Filled in by the Turnstile widget. Verified on the server, never trusted as-is.
const turnstileToken = z.string().max(2048).optional();

const ownerPassword = z.string().superRefine((pw, ctx) => {
  const problem = checkPassword(pw, 'owner');
  if (problem) ctx.addIssue({ code: 'custom', message: passwordProblemMessage(problem, 'owner') });
});

export const signupSchema = z
  .object({
    shopName: plainText(80),
    shopSlug: shopSlugSchema,
    businessType: z.enum(BUSINESS_TYPES),
    ownerName: plainText(60),
    username: usernameSchema,
    password: ownerPassword,
    turnstileToken,
  })
  .strict();

export type SignupInput = z.infer<typeof signupSchema>;

// Login only looks values up, so it checks shape and size, not the signup rules.
/** A 6-digit code from an authenticator app. */
export const totpCode = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code.');

export const loginSchema = z
  .object({
    shopSlug: z.string().trim().toLowerCase().min(1, 'Required.').max(40),
    username: z.string().trim().toLowerCase().min(1, 'Required.').max(32),
    password: z.string().min(1, 'Required.').max(128),
    turnstileToken,
    // Only for accounts with two-step login on; asked for after the password is right.
    totpCode: totpCode.optional(),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;

// Owner password reset with a one-time recovery code (Section 7.12).
export const recoverSchema = z
  .object({
    shopSlug: z.string().trim().toLowerCase().min(1, 'Required.').max(40),
    username: z.string().trim().toLowerCase().min(1, 'Required.').max(32),
    code: z.string().trim().min(1, 'Required.').max(32),
    newPassword: ownerPassword,
    turnstileToken,
  })
  .strict();

export type RecoverInput = z.infer<typeof recoverSchema>;

export const enableTotpSchema = z
  .object({ secret: z.string().regex(/^[A-Z2-7]{32}$/), code: totpCode })
  .strict();
export const disableTotpSchema = z.object({ code: totpCode }).strict();
