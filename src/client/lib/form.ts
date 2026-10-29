import type { z } from 'zod';

export type FieldErrors = Record<string, string>;

/**
 * Validates in the browser with the same Zod schema the server uses, for quick feedback.
 * The server still validates everything; this only saves a round trip.
 */
export function validate<S extends z.ZodType>(
  schema: S,
  values: unknown,
): { data: z.infer<S>; errors: null } | { data: null; errors: FieldErrors } {
  const result = schema.safeParse(values);
  if (result.success) return { data: result.data, errors: null };
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? 'form');
    errors[key] ??= issue.message;
  }
  return { data: null, errors };
}

/** The errors without one field's entry, e.g. once the user edits that field. */
export function withoutError(errors: FieldErrors, field: string): FieldErrors {
  return Object.fromEntries(Object.entries(errors).filter(([key]) => key !== field));
}

/** Moves focus to the first field with an error, in page order. */
export function focusFirstError(form: HTMLFormElement | null, errors: FieldErrors) {
  if (!form) return;
  for (const el of Array.from(form.elements)) {
    if (el instanceof HTMLElement && 'name' in el && String(el.name) in errors) {
      el.focus();
      return;
    }
  }
}
