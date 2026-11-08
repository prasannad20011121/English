import type { z } from 'zod';

/** Turns Zod issues into `{ "field.path": "first message" }` for form-friendly error responses. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_';
    fields[key] ??= issue.message;
  }
  return fields;
}
