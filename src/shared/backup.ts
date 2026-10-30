// Full shop backup (Phase 3.5): one JSON file the owner can keep, and restore through the
// import flow. Staff accounts are left out on purpose: passwords can't be restored from a
// file, and a backup without them is safe to store or share with someone helping you.
import { IMPORT_COLUMNS, type ImportColumn, type ParseResult } from './import';

export const BACKUP_FORMAT = 'bls-pos-backup';
export const BACKUP_VERSION = 1;

export type BackupProduct = {
  name: string;
  sku: string | null;
  category: string | null;
  priceCents: number;
  costCents: number | null;
  trackStock: boolean;
  stock: number;
  lowStockThreshold: number;
  archived: boolean;
};

export type BackupMovement = {
  date: string;
  product: string;
  sku: string | null;
  change: number;
  reason: string;
  note: string | null;
  by: string;
};

export type Backup = {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  shop: { name: string; slug: string; currency: string };
  categories: string[];
  products: BackupProduct[];
  /** History, for your records; restoring sets stock directly instead of replaying it. */
  movements: BackupMovement[];
};

const pesos = (cents: number | null) => (cents == null ? '' : (cents / 100).toFixed(2));

/**
 * Reads a backup file and turns its products into import rows, so restore goes through the
 * same checks, review and chunked saving as a spreadsheet import. Archived products are
 * left out (restore what you sell).
 */
export function backupToImport(json: unknown): { backup: Backup; result: ParseResult } {
  const b = json as Partial<Backup> | null;
  if (b?.format !== BACKUP_FORMAT || !Array.isArray(b.products)) {
    throw new Error("That file isn't a bls POS backup.");
  }
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) {
    throw new Error('That backup is from a newer version of bls POS. Update first.');
  }
  const rows = b.products
    .filter((p) => !p.archived)
    .map((p, i) => {
      const values: Record<ImportColumn, string> = {
        // The file came from outside; anything malformed fails the normal row checks.
        name: typeof p.name === 'string' ? p.name : '',
        sku: p.sku ?? '',
        category: p.category ?? '',
        price: pesos(p.priceCents),
        cost: pesos(p.costCents),
        stock: p.trackStock ? String(p.stock) : '',
        low_stock_threshold: String(p.lowStockThreshold),
        track_stock: p.trackStock ? 'yes' : 'no',
      };
      // Line numbers count like a spreadsheet: row 1 would be the header.
      return { line: i + 2, values };
    });
  return {
    backup: b as Backup,
    result: { rows, columns: [...IMPORT_COLUMNS], ignored: [], missing: [], truncated: false },
  };
}
