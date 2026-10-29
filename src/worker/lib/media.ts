// Every stored object of a shop lives under shops/<shopId>/, so access checks are simple.
export function shopPrefix(shopId: string): string {
  return `shops/${shopId}/`;
}

export function mediaUrl(key: string): string {
  return `/api/v1/media/${key}`;
}
