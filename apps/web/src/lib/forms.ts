import type { ZodType } from 'zod';
import { z } from 'zod';

/** Validate with a shared zod schema and return the first message per field. */
export function validate<T>(
  schema: ZodType<T>,
  value: unknown,
): { data: T | null; errors: Record<string, string> } {
  const res = schema.safeParse(value);
  if (res.success) return { data: res.data, errors: {} };
  const flat = z.flattenError(res.error);
  const errors: Record<string, string> = {};
  for (const [k, v] of Object.entries(flat.fieldErrors as Record<string, string[] | undefined>))
    if (v?.[0]) errors[k] = v[0];
  if (flat.formErrors[0]) errors._form = flat.formErrors[0];
  return { data: null, errors };
}
