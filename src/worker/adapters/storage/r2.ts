import type { StorageAdapter, StoredObject } from '../types';

/** Free edition storage: Cloudflare R2 (no egress fees). */
export class R2Storage implements StorageAdapter {
  constructor(private readonly bucket: R2Bucket) {}

  async put(key: string, data: ArrayBuffer, contentType: string): Promise<void> {
    await this.bucket.put(key, data, { httpMetadata: { contentType } });
  }

  async get(key: string): Promise<StoredObject | null> {
    const obj = await this.bucket.get(key);
    if (!obj) return null;
    return {
      body: obj.body,
      contentType: obj.httpMetadata?.contentType ?? 'application/octet-stream',
      size: obj.size,
    };
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }

  async usedBytes(prefix: string): Promise<number> {
    let total = 0;
    let cursor: string | undefined;
    do {
      const page = await this.bucket.list({ prefix, ...(cursor ? { cursor } : {}) });
      for (const obj of page.objects) total += obj.size;
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    return total;
  }
}
