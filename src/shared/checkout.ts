// Cash checkout helpers for the sell screen (Phase 4).

/**
 * Quick cash buttons (Section 6.5: exact, ₱100, ₱500, ₱1000), plus the next round amount
 * above the total, so the usual "₱500 for ₱386" is one tap. Only amounts that cover the
 * total, in centavos, smallest first, no duplicates.
 */
export function quickCashAmounts(totalCents: number): number[] {
  const bills = [10_000, 50_000, 100_000];
  const nextHundred = Math.ceil(totalCents / 10_000) * 10_000;
  const nextFiveHundred = Math.ceil(totalCents / 50_000) * 50_000;
  const options = [totalCents, nextHundred, nextFiveHundred, ...bills].filter(
    (c) => c >= totalCents && c > 0,
  );
  return [...new Set(options)].sort((a, b) => a - b).slice(0, 5);
}

/** A keypad press applied to the typed amount (in pesos, as text). */
export function applyKey(typed: string, key: string): string {
  if (key === 'C') return '';
  if (key === '⌫') return typed.slice(0, -1);
  if (key === '.') return typed.includes('.') ? typed : `${typed || '0'}.`;
  const [, decimals = ''] = typed.split('.');
  if (typed.includes('.') && decimals.length >= 2) return typed;
  const next = typed === '0' ? key : typed + key;
  // Up to ₱9,999,999.99 typed.
  return next.replace(/^0+(?=\d)/, '').length > 10 ? typed : next;
}
