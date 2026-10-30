// Client-side image compression (Section 7.8): photos are resized and re-encoded on the
// device before upload, so a 5 MB phone photo becomes a ~100 KB WebP.

export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';

export const MAX_WIDTH = { product: 800, cover: 1600, logo: 512, avatar: 512 } as const;

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

/**
 * Resizes to at most `maxWidth` (never enlarges) and encodes as WebP, or JPEG on
 * browsers that can't write WebP. Throws a friendly error for files that aren't images.
 */
export async function compressImage(file: File, maxWidth: number, quality = 0.82): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error("That file isn't a photo we can read. Use a JPEG, PNG or WebP image.");
  }
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot process photos.');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const webp = await toBlob(canvas, 'image/webp', quality);
  if (webp?.type === 'image/webp') return webp;
  const jpeg = await toBlob(canvas, 'image/jpeg', quality);
  if (!jpeg) throw new Error('Could not process this photo.');
  return jpeg;
}
