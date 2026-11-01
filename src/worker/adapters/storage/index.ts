import { forgetCachedMedia } from '../../lib/serve-media';
import type { StorageAdapter, StoredObject } from '../types';
import { D1Storage } from './d1';

/** Removing an image also drops this location's edge-cached copy (lib/serve-media). */
class CacheAwareStorage implements StorageAdapter {
  constructor(private readonly inner: StorageAdapter) {}
  put(key: string, data: ArrayBuffer, contentType: string): Promise<void> {
    return this.inner.put(key, data, contentType);
  }
  get(key: string): Promise<StoredObject | null> {
    return this.inner.get(key);
  }
  async delete(key: string): Promise<void> {
    await this.inner.delete(key);
    await forgetCachedMedia(key);
  }
  usedBytes(prefix: string): Promise<number> {
    return this.inner.usedBytes(prefix);
  }
  deletePrefix(prefix: string): Promise<void> {
    return this.inner.deletePrefix(prefix);
  }
}

/**
 * The storage the app uses for photos and backups. D1 for now (no card needed); to move
 * to R2 later, add the `MEDIA` bucket binding and wrap `new R2Storage(env.MEDIA)` instead.
 */
export function mediaStorage(env: Env): StorageAdapter {
  return new CacheAwareStorage(new D1Storage(env.MEDIA_DB));
}
