// Barcode / SKU input for the sell screen (Phase 4).

/** The product whose SKU is exactly this code, ignoring case and spaces around it. */
export function findBySku<T extends { sku: string | null }>(
  products: readonly T[],
  code: string,
): T | undefined {
  const c = code.trim().toUpperCase();
  if (!c) return undefined;
  return products.find((p) => p.sku?.toUpperCase() === c);
}

// Scanners "type" a whole code in well under a second, a few ms per key; people don't.
export const SCAN_MAX_KEY_GAP_MS = 50;
export const SCAN_MIN_LENGTH = 3;

/**
 * Turns key presses into scans: characters arriving close together, ending with Enter,
 * are one scan. Feed it every key with its time; it returns the code when a scan ends.
 */
export function createScanReader() {
  let buffer = '';
  let last = 0;
  return (key: string, at: number): string | null => {
    if (at - last > SCAN_MAX_KEY_GAP_MS) buffer = '';
    last = at;
    if (key === 'Enter') {
      const code = buffer;
      buffer = '';
      return code.length >= SCAN_MIN_LENGTH ? code : null;
    }
    if (key.length === 1) buffer += key;
    return null;
  };
}
