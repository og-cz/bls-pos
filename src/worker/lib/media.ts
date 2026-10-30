// Every stored object of a shop lives under shops/<shopId>/, so access checks are simple.
export function shopPrefix(shopId: string): string {
  return `shops/${shopId}/`;
}

/**
 * Product photos come in two sizes, made on the device: the full photo and a small
 * thumbnail for lists. The thumbnail lives next to the photo:
 * shops/<id>/product/<uuid>.webp → shops/<id>/product/<uuid>.thumb.webp
 */
export function thumbKeyFor(key: string): string {
  return key.replace(/(\.[a-z0-9]+)$/, '.thumb$1');
}

export function mediaUrl(key: string): string {
  return `/api/v1/media/${key}`;
}
