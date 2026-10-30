// Photos are resized and re-encoded on the device before upload (Section 7.8), so a 5 MB
// phone photo becomes a sharp ~150 KB WebP plus a ~15 KB thumbnail for lists.

export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';

/** Longest side in pixels for each kind of image. */
export const MAX_EDGE = { product: 1600, productThumb: 320, cover: 1600, logo: 512, avatar: 512 };

// Size targets. Product photos keep enough detail to read part numbers and labels.
const PHOTO_TARGET_BYTES = 200 * 1024;
const THUMB_TARGET_BYTES = 24 * 1024;
const QUALITIES = [0.82, 0.76, 0.7, 0.62];

async function readImage(file: Blob): Promise<ImageBitmap> {
  try {
    // from-image applies the phone's rotation, so photos aren't sideways.
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error("That file isn't a photo we can read. Use a JPEG, PNG or WebP image.");
  }
}

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

/**
 * Scales so the longest side is at most `maxEdge` (never enlarges). Big reductions are
 * done in halving steps, which keeps fine detail sharper than one big jump.
 */
function scaleTo(source: CanvasImageSource & { width: number; height: number }, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(source.width, source.height));
  const targetW = Math.max(1, Math.round(source.width * scale));
  const targetH = Math.max(1, Math.round(source.height * scale));

  let current: CanvasImageSource & { width: number; height: number } = source;
  while (current.width / 2 >= targetW && current.height / 2 >= targetH) {
    const half = canvasOf(Math.round(current.width / 2), Math.round(current.height / 2));
    const ctx = half.getContext('2d');
    if (!ctx) break;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(current, 0, 0, half.width, half.height);
    current = half;
  }
  const out = canvasOf(targetW, targetH);
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('This browser cannot process photos.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(current, 0, 0, targetW, targetH);
  return out;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

let webpSupport: Promise<boolean> | undefined;
/** Some older Safari versions can't write WebP; they get JPEG instead. */
function canWriteWebp(): Promise<boolean> {
  webpSupport ??= toBlob(canvasOf(1, 1), 'image/webp', 0.8).then((b) => b?.type === 'image/webp');
  return webpSupport;
}

/** Highest quality that fits the size target (or the smallest we can do). */
async function encodeUnder(canvas: HTMLCanvasElement, type: string, maxBytes: number) {
  let last: Blob | null = null;
  for (const q of QUALITIES) {
    last = await toBlob(canvas, type, q);
    if (last && last.size <= maxBytes) return last;
  }
  if (!last) throw new Error('Could not process this photo.');
  return last;
}

/**
 * A product photo in two sizes, same format: `full` for the tap-to-view screen (up to
 * 1600 px, about 200 KB at most) and `thumb` for lists (320 px, about 15–25 KB).
 */
export async function prepareProductPhoto(file: File): Promise<{ full: Blob; thumb: Blob }> {
  const bitmap = await readImage(file);
  try {
    const type = (await canWriteWebp()) ? 'image/webp' : 'image/jpeg';
    let fullCanvas = scaleTo(bitmap, MAX_EDGE.product);
    let full = await encodeUnder(fullCanvas, type, PHOTO_TARGET_BYTES);
    if (full.size > PHOTO_TARGET_BYTES) {
      // Very detailed photo: a little smaller is better than blurry.
      fullCanvas = scaleTo(bitmap, 1280);
      full = await encodeUnder(fullCanvas, type, PHOTO_TARGET_BYTES);
    }
    const thumb = await encodeUnder(
      scaleTo(bitmap, MAX_EDGE.productThumb),
      type,
      THUMB_TARGET_BYTES,
    );
    return { full, thumb };
  } finally {
    bitmap.close();
  }
}

/** Logos, covers and avatars: one size, WebP (or JPEG). */
export async function compressImage(file: File, maxEdge: number): Promise<Blob> {
  const bitmap = await readImage(file);
  try {
    const type = (await canWriteWebp()) ? 'image/webp' : 'image/jpeg';
    return await encodeUnder(scaleTo(bitmap, maxEdge), type, PHOTO_TARGET_BYTES);
  } finally {
    bitmap.close();
  }
}
