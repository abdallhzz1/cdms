import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { NotFound } from '@/pages/NotFound';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredPermission?: string;
  requiredRole?: string | string[];
}

/**
 * Wraps any route that requires an authenticated session and optional
 * role/permission checks. If access is denied, stealthily renders <NotFound /> (404)
 * to avoid disclosing administrative route existence (Zero Info Disclosure).
 */
export function ProtectedRoute({ children, requiredPermission, requiredRole }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, can, hasRole } = useAuth();
  const { t } = useI18n();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-slate-500">{t('common.loading')}</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Stealth Access Control: Renders <NotFound /> for unauthorized users to prevent route disclosure
  if (requiredPermission && !can(requiredPermission)) {
    return <NotFound />;
  }

  if (requiredRole) {
    const rolesToCheck = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    const userHasRole = rolesToCheck.some((r) => hasRole(r));
    if (!userHasRole) {
      return <NotFound />;
    }
  }

  return <>{children}</>;
}
