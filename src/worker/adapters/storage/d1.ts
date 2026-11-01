import type { StorageAdapter, StoredObject } from '../types';

/** Largest object a D1 row can hold, with room for the key and other columns. */
export const D1_MAX_OBJECT_BYTES = 1_900_000;

// Keys are compared as text, so everything under a prefix sorts between the prefix and
// the prefix followed by the highest character. This uses the primary-key index.
const END = '￿';

/**
 * Free edition storage without a card: objects live in a second D1 database (see
 * docs/LIMITS.md). R2 (./r2.ts) stays available for accounts that can enable it.
 */
export class D1Storage implements StorageAdapter {
  constructor(private readonly db: D1Database) {}

  async put(key: string, data: ArrayBuffer, contentType: string): Promise<void> {
    if (data.byteLength > D1_MAX_OBJECT_BYTES) throw new Error('Object too large for D1');
    await this.db
      .prepare(
        `INSERT INTO objects (key, content_type, size, data, created_at) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(key) DO UPDATE SET content_type = ?2, size = ?3, data = ?4, created_at = ?5`,
      )
      .bind(key, contentType, data.byteLength, data, Date.now())
      .run();
  }

  async get(key: string): Promise<StoredObject | null> {
    const row = await this.db
      .prepare('SELECT content_type, size, data FROM objects WHERE key = ?1')
      .bind(key)
      .first<{ content_type: string; size: number; data: number[] | ArrayBuffer }>();
    if (!row) return null;
    // D1 hands blobs back as an array of byte values.
    const bytes =
      row.data instanceof ArrayBuffer ? new Uint8Array(row.data) : Uint8Array.from(row.data);
    return { body: new Blob([bytes]).stream(), contentType: row.content_type, size: row.size };
  }

  async delete(key: string): Promise<void> {
    await this.db.prepare('DELETE FROM objects WHERE key = ?1').bind(key).run();
  }

  async usedBytes(prefix: string): Promise<number> {
    const row = await this.db
      .prepare('SELECT COALESCE(SUM(size), 0) AS total FROM objects WHERE key >= ?1 AND key < ?2')
      .bind(prefix, prefix + END)
      .first<{ total: number }>();
    return row?.total ?? 0;
  }

  async deletePrefix(prefix: string): Promise<void> {
    await this.db
      .prepare('DELETE FROM objects WHERE key >= ?1 AND key < ?2')
      .bind(prefix, prefix + END)
      .run();
  }
}
