/** True if a D1 error is a UNIQUE constraint failure on `column` (e.g. 'shops.slug'). */
export function isUniqueViolation(err: unknown, column: string): boolean {
  const text = String(err instanceof Error && err.cause ? err.cause : err);
  return text.includes('UNIQUE constraint failed') && text.includes(column);
}
