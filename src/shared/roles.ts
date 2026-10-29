export const ROLES = ['owner', 'admin', 'staff'] as const;
export type Role = (typeof ROLES)[number];

// Each role can do everything the roles below it can (Section 1.1).
const RANK: Record<Role, number> = { staff: 1, admin: 2, owner: 3 };

/** True if `role` is `minimum` or higher, e.g. an owner passes an admin check. */
export function hasRole(role: Role, minimum: Role): boolean {
  return RANK[role] >= RANK[minimum];
}
