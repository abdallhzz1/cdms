import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { ShieldAlert } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredPermission?: string;
  requiredRole?: string | string[];
}

/**
 * Wraps any route that requires an authenticated session and optional
 * role/permission checks. If the user lacks access, displays a clean 403 screen.
 */
export function ProtectedRoute({ children, requiredPermission, requiredRole }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, can, hasRole } = useAuth();
  const { t, locale } = useI18n();
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

  // Check required permission
  if (requiredPermission && !can(requiredPermission)) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl border border-red-100 shadow-xl p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto border border-red-100">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            {locale === 'ar' ? 'غير مصرح بالدخول (403)' : 'Access Denied (403)'}
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            {locale === 'ar' 
              ? 'عذراً، هذه الشاشة مخصصة لمدير النظام الفني فقط (System Administrator) ولا تملك الصلاحيات المطلوبة للوصول إليها.' 
              : 'Sorry, this screen is restricted to System Administrators only.'}
          </p>
          <a
            href="/"
            className="inline-block px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
          >
            {locale === 'ar' ? 'العودة للرئيسية' : 'Return to Home'}
          </a>
        </div>
      </div>
    );
  }

  // Check required role
  if (requiredRole) {
    const rolesToCheck = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    const userHasRole = rolesToCheck.some((r) => hasRole(r));
    if (!userHasRole) {
      return (
        <div className="min-h-[70vh] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-3xl border border-red-100 shadow-xl p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto border border-red-100">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              {locale === 'ar' ? 'غير مصرح بالدخول (403)' : 'Access Denied (403)'}
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              {locale === 'ar' 
                ? 'عذراً، هذه الشاشة مخصصة لمدير النظام الفني فقط (System Administrator) ولا تملك الصلاحيات المطلوبة للوصول إليها.' 
                : 'Sorry, this screen is restricted to System Administrators only.'}
            </p>
            <a
              href="/"
              className="inline-block px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
            >
              {locale === 'ar' ? 'العودة للرئيسية' : 'Return to Home'}
            </a>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
}
