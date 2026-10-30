import { hexToOklch, rgbToHex } from '@shared/theme';

/**
 * The main colors of an image, most used first (Section 6.4 "Pick from logo"). Runs in
 * the browser on a 64×64 copy: transparent pixels and near-white, near-black and gray
 * backgrounds are skipped, so the brand colors come out on top.
 */
export async function dominantColors(url: string, count = 5): Promise<string[]> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  // Group similar colors: 5 bits per channel.
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const [r = 0, g = 0, b = 0, a = 0] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 128) continue;
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bucket.n += 1;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }

  // Soft edges blend the logo into its background; those mixes cover very little.
  let opaque = 0;
  for (const bucket of buckets.values()) opaque += bucket.n;
  const picked: string[] = [];
  const sorted = [...buckets.values()].sort((x, y) => y.n - x.n);
  for (const { n, r, g, b } of sorted) {
    if (n < opaque * 0.02) break;
    const hex = rgbToHex([r / n / 255, g / n / 255, b / n / 255]);
    const { l, c, h } = hexToOklch(hex);
    if (c < 0.04 || l > 0.95 || l < 0.12) continue; // background, not brand
    const close = picked.some((p) => {
      const o = hexToOklch(p);
      const dh = Math.min(Math.abs(o.h - h), 360 - Math.abs(o.h - h));
      return dh < 18 && Math.abs(o.l - l) < 0.12;
    });
    if (!close) picked.push(hex);
    if (picked.length === count) break;
  }
  return picked;
}
