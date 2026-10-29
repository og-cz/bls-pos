// Image upload checks (Section 7.8). JPEG, PNG and WebP only: never SVG, which can carry
// scripts. The declared type must match the file's first bytes, so a renamed file or a
// disguised HTML page is refused.

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export const IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;
export type ImageType = keyof typeof IMAGE_TYPES;

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  return sig.every((b, i) => bytes[offset + i] === b);
}

/** The real type of the data, from its magic bytes, or null if it isn't an allowed image. */
export function sniffImageType(data: ArrayBuffer): ImageType | null {
  const b = new Uint8Array(data.slice(0, 16));
  if (startsWith(b, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  // "RIFF" <size> "WEBP"
  if (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp';
  }
  return null;
}
