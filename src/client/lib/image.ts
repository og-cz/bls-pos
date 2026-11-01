// Photos are resized and re-encoded on the device before upload (Section 7.8). AVIF is
// used when the browser can show it: a 5 MB phone photo becomes a sharp ~60-90 KB AVIF
// plus a ~6-10 KB thumbnail, about half the size of WebP at the same look. The AVIF
// encoder (WebAssembly, ~3.5 MB) loads only when someone saves a photo. Browsers that
// can't show AVIF, or a failed encode, fall back to WebP (or JPEG on old Safari).

export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/avif';

/** Longest side in pixels for each kind of image. */
export const MAX_EDGE = { product: 1600, productThumb: 320, cover: 1600, logo: 512, avatar: 512 };

// Size targets. Product photos keep enough detail to read part numbers and labels.
const PHOTO_TARGET_BYTES = 200 * 1024;
const THUMB_TARGET_BYTES = 24 * 1024;
const QUALITIES = [0.82, 0.76, 0.7, 0.62];
// AVIF looks as good at much smaller sizes, so it aims lower.
const AVIF_PHOTO_TARGET_BYTES = 90 * 1024;
const AVIF_THUMB_TARGET_BYTES = 10 * 1024;
const AVIF_QUALITIES = [64, 56, 48, 40];

// A tiny AVIF: if the browser can decode it, it can show AVIF photos.
const TINY_AVIF =
  'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A=';

let avifSupport: Promise<boolean> | undefined;
function canShowAvif(): Promise<boolean> {
  avifSupport ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve(img.width > 0);
    };
    img.onerror = () => {
      resolve(false);
    };
    img.src = TINY_AVIF;
  });
  return avifSupport;
}

/** AVIF at the highest quality that fits, or null to fall back to WebP/JPEG. */
async function encodeAvifUnder(canvas: HTMLCanvasElement, maxBytes: number): Promise<Blob | null> {
  if (!(await canShowAvif())) return null;
  try {
    const { default: encode } = await import('@jsquash/avif/encode.js');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let last: ArrayBuffer | null = null;
    for (const quality of AVIF_QUALITIES) {
      // speed 7: a few seconds at most on a mid-range phone; subsample 1 = 4:2:0 colour.
      last = await encode(pixels, { quality, speed: 7, subsample: 1 });
      if (last.byteLength <= maxBytes) break;
    }
    return last ? new Blob([last], { type: 'image/avif' }) : null;
  } catch {
    return null; // encoder failed to load or run: WebP it is
  }
}

/** Best format the browser supports: AVIF, else WebP, else JPEG. */
async function encodeBest(canvas: HTMLCanvasElement, maxBytes: number, avifMaxBytes: number) {
  const avif = await encodeAvifUnder(canvas, avifMaxBytes);
  if (avif) return avif;
  const type = (await canWriteWebp()) ? 'image/webp' : 'image/jpeg';
  return encodeUnder(canvas, type, maxBytes);
}

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
export async function prepareProductPhoto(
  file: Blob,
  options: { cropAspect?: number } = {},
): Promise<{ full: Blob; thumb: Blob }> {
  const original = await readImage(file);
  // Bulk uploads skip the editor, so they are centre-cropped to the same shape here.
  const bitmap = options.cropAspect ? await centerCrop(original, options.cropAspect) : original;
  try {
    let fullCanvas = scaleTo(bitmap, MAX_EDGE.product);
    let full = await encodeBest(fullCanvas, PHOTO_TARGET_BYTES, AVIF_PHOTO_TARGET_BYTES);
    const target = full.type === 'image/avif' ? AVIF_PHOTO_TARGET_BYTES : PHOTO_TARGET_BYTES;
    if (full.size > target) {
      // Very detailed photo: a little smaller is better than blurry.
      fullCanvas = scaleTo(bitmap, 1280);
      full = await encodeBest(fullCanvas, PHOTO_TARGET_BYTES, AVIF_PHOTO_TARGET_BYTES);
    }
    // The thumbnail uses the same format as the full photo.
    const thumbCanvas = scaleTo(bitmap, MAX_EDGE.productThumb);
    const avifThumb =
      full.type === 'image/avif'
        ? await encodeAvifUnder(thumbCanvas, AVIF_THUMB_TARGET_BYTES)
        : null;
    const thumb =
      avifThumb ??
      (await encodeUnder(
        thumbCanvas,
        full.type === 'image/avif' ? 'image/webp' : full.type,
        THUMB_TARGET_BYTES,
      ));
    return { full, thumb };
  } finally {
    bitmap.close();
    original.close();
  }
}

/** The largest centred area of the given width:height shape. */
async function centerCrop(source: ImageBitmap, aspect: number): Promise<ImageBitmap> {
  const w = Math.min(source.width, source.height * aspect);
  const h = w / aspect;
  return createImageBitmap(
    source,
    Math.round((source.width - w) / 2),
    Math.round((source.height - h) / 2),
    Math.round(w),
    Math.round(h),
  );
}

/** Logos, covers and avatars: one size, AVIF (or WebP/JPEG). */
export async function compressImage(file: Blob, maxEdge: number): Promise<Blob> {
  const bitmap = await readImage(file);
  try {
    return await encodeBest(scaleTo(bitmap, maxEdge), PHOTO_TARGET_BYTES, AVIF_PHOTO_TARGET_BYTES);
  } finally {
    bitmap.close();
  }
}
