import { env } from 'cloudflare:workers';

import { D1Storage } from '../../src/worker/adapters/storage/d1';

const storage = () => new D1Storage(env.MEDIA_DB);

/** The stored object under a key, or null. Reads the media database directly. */
export async function stored(key: string) {
  const obj = await storage().get(key);
  if (!obj) return null;
  return {
    contentType: obj.contentType,
    bytes: new Uint8Array(await new Response(obj.body).arrayBuffer()),
  };
}

export async function storeText(key: string, text: string): Promise<void> {
  await storage().put(key, new TextEncoder().encode(text).buffer as ArrayBuffer, 'text/plain');
}

export async function gunzipText(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}
