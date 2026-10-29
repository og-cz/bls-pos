// Audit actions (Section 7.13). More are added as features land (products, sales, theme...).
export const AUDIT_ACTIONS = [
  'shop.create',
  'login.success',
  'login.failed',
  'login.locked',
  'password.recover',
  'recover.failed',
  'staff.create',
  'staff.deactivate',
  'product.create',
  'product.update',
  'product.archive',
  'product.unarchive',
  'category.create',
  'category.update',
  'category.delete',
  'stock.restock',
  'stock.deduct',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditEntry = {
  id: string;
  action: AuditAction;
  /** Who did it: null when nobody was signed in. */
  user: { id: string; displayName: string } | null;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown> | null;
  createdAt: number;
};
