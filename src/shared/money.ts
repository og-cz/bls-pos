// Money is integer centavos everywhere (Section 4). These helpers are the only place
// centavos meet decimal pesos, so floating point never touches stored amounts.

const formatters = new Map<string, Intl.NumberFormat>();

/** 125000 → "₱1,250.00" (tabular figures come from CSS, Section 6.1). */
export function formatCents(cents: number, currency = 'PHP'): string {
  let f = formatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat('en-PH', { style: 'currency', currency });
    formatters.set(currency, f);
  }
  return f.format(cents / 100);
}

/**
 * Parses what a person types ("1,250.5", "₱ 99", "12") into centavos, or null if it
 * isn't an amount. At most two decimal places; never negative.
 */
export function parseAmountToCents(input: string): number | null {
  const cleaned = input.replace(/[₱,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole = '0', fraction = ''] = cleaned.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** 125050 → "1250.50", for prefilling an amount field. */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}
