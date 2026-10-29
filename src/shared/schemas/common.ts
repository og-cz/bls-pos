import { z } from 'zod';

export const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{1,30})[a-z0-9]$/;

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(USERNAME_PATTERN, 'Use 3–32 letters, numbers, dots, dashes or underscores.');

/** Names, bios and labels: plain text only (Section 7.5). */
export const plainText = (max: number) =>
  z
    .string()
    .trim()
    .min(1, 'Required.')
    .max(max, `Use at most ${max} characters.`)
    // Plain text only: no control characters.
    .refine((s) => !/\p{Cc}/u.test(s), 'Contains characters that are not allowed.');
