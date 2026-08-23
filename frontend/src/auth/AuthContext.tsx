import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError } from '@/api/client';
import { fetchCurrentUser, login as loginRequest, logout as logoutRequest, type AuthenticatedUser, type Permission } from '@/api/auth';

interface AuthContextValue {
  user: AuthenticatedUser | null;
  isAuthenticated: boolean;
  /** True only while the initial session check (on app load) is pending. */
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /**
   * Server-driven permission check — never a hardcoded role/permission list
   * on the frontend (Prompt 02 §17). This is a UX convenience only
   * (hide/disable controls the user can't use); the backend re-checks every
   * request regardless (Prompt 01/02: frontend authorization is UX-only).
   */
  can: (permissionCode: string) => boolean;
  hasRole: (roleCode: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetchCurrentUser()
      .then((current) => {
        if (!cancelled) setUser(current);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const authenticated = await loginRequest(email, password);
    setUser(authenticated);
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        throw error;
      }
    } finally {
      setUser(null);
    }
  }, []);

  const can = useCallback(
    (permissionCode: string) => {
      if (!user) return false;
      return user.permissions?.some((permission: Permission) => permission.code === permissionCode) ?? false;
    },
    [user],
  );

  const hasRole = useCallback(
    (roleCode: string) =>
      user?.roles?.includes(roleCode) ?? false,
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: user !== null, isLoading, login, logout, can, hasRole }),
    [user, isLoading, login, logout, can, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>.');
  }
  return ctx;
}
