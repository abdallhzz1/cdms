import { apiFetch, ApiError } from './client';

export interface Permission {
  code: string;
  scope: string;
}

export interface AuthenticatedUser {
  id: number;
  name: string;
  email: string;
  roles: string[];
  permissions: Permission[];
  assigned_levels?: string[] | null;
}

export function login(email: string, password: string): Promise<AuthenticatedUser> {
  return apiFetch<AuthenticatedUser>('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

export function logout(): Promise<null> {
  return apiFetch<null>('/auth/logout', { method: 'POST' });
}

/**
 * Used on app load to discover whether the (cookie-based) session is still
 * authenticated — there is no client-side token to inspect, so this is the
 * only way to know. A 401 here is an expected, ordinary outcome (not
 * logged in / session expired), not a real error — callers should treat
 * it as "unauthenticated" rather than surfacing it as a failure.
 */
export async function fetchCurrentUser(): Promise<AuthenticatedUser | null> {
  try {
    return await apiFetch<AuthenticatedUser>('/auth/me', { method: 'GET' });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}
