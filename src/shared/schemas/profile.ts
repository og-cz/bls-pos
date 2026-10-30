import { z } from 'zod';

import { plainText } from './common';

/** What anyone may change about themselves (Section 6: each user has a profile). */
export const updateProfileSchema = z.object({ displayName: plainText(60) }).strict();
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
