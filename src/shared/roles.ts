export const ROLES = ['owner', 'admin', 'staff'] as const;
export type Role = (typeof ROLES)[number];
