import type { Context } from 'hono';
import type { z } from 'zod';

import { ApiError } from './errors';

/**
 * Parses the JSON body with a Zod schema. Server-side validation is the one that counts:
 * schemas are `.strict()`, so unknown fields (e.g. a smuggled `role` or `price`) are rejected.
 */
export async function parseJson<T extends z.ZodType>(c: Context, schema: T): Promise<z.output<T>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      fields[key] ??= issue.message;
    }
    throw new ApiError(400, 'VALIDATION_ERROR', 'Some fields need fixing.', fields);
  }
  return result.data;
}
