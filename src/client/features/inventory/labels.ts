import type { DeductReason } from '@shared/schemas/inventory';

export const REASON_LABEL: Record<DeductReason, string> = {
  damaged: 'Damaged',
  expired: 'Expired',
  used: 'Used in the shop',
  lost: 'Lost or missing',
};

/** Words for every movement reason in the history list. */
export const MOVEMENT_LABEL: Record<string, string> = {
  ...REASON_LABEL,
  restock: 'Restocked',
  sale: 'Sold',
  void: 'Sale voided',
  correction: 'Correction',
};
