import { z } from 'zod';

import { plainText, usernameSchema } from './common';

/** Roles an owner or admin can give. Nobody can create a second owner (Section 7.4). */
export const ASSIGNABLE_ROLES = ['admin', 'staff'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

// The server generates the temporary password, so the client never sends one.
export const createStaffSchema = z
  .object({
    username: usernameSchema,
    displayName: plainText(60),
    role: z.enum(ASSIGNABLE_ROLES).default('staff'),
  })
  .strict();

export type CreateStaffInput = z.infer<typeof createStaffSchema>;

export type StaffMember = {
  id: string;
  username: string;
  displayName: string;
  role: 'owner' | AssignableRole;
  active: boolean;
  createdAt: number;
  avatarUrl: string | null;
};
