import { z } from 'zod';

/**
 * Client-side validation is a UX layer only — the backend
 * (App\Http\Requests\Auth\LoginRequest) is the actual source of truth and
 * re-validates every field regardless (PROJECT_RULES.md §6/§8).
 */
export const loginSchema = z.object({
  email: z.string().min(1, 'validation.required').email('validation.email'),
  password: z.string().min(1, 'validation.required'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
