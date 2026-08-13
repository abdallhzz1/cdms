import { useForm, type UseFormProps, type FieldValues } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';

/**
 * Standard React Hook Form + Zod wiring for the whole app. Business forms
 * (Phase 2+) call this instead of `useForm` directly, so every form
 * validates the same way and server-side validation stays the single
 * source of truth for correctness (Zod here is a UX layer, not a
 * replacement for backend validation — PROJECT_RULES.md §6/§8).
 *
 * No business form is built on top of this in Phase 1; see
 * src/lib/form/useZodForm.test.ts for proof the wiring itself works.
 */
export function useZodForm<Schema extends z.ZodType<FieldValues>>(
  schema: Schema,
  options?: Omit<UseFormProps<z.infer<Schema>>, 'resolver'>,
) {
  return useForm<z.infer<Schema>>({
    ...options,
    resolver: zodResolver(schema),
  });
}
