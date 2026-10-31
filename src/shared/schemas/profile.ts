import { z } from 'zod';

import { plainText } from './common';

/** What anyone may change about themselves (Section 6: each user has a profile). */
export const updateProfileSchema = z.object({ displayName: plainText(60) }).strict();
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** Changing your own password: the current one proves it's you. */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Required.').max(128),
    newPassword: z.string().min(1, 'Required.').max(128),
  })
  .strict();
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
