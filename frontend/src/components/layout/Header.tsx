import { useState } from 'react';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/auth/AuthContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

export function Header() {
  const { t } = useI18n();
  const { user, logout, can } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-800">{t('common.appName')}</p>
        <p className="truncate text-xs text-slate-500">{t('common.organization')}</p>
      </div>

      <div className="flex items-center gap-4">
        {user && (
          <div className="hidden text-end text-xs text-slate-500 sm:block">
            <p>
              {t('auth.signedInAs')} <span className="font-medium text-slate-700">{user.name}</span>
            </p>
            {/* Permission-based UI behavior (Prompt 02 §30, frontend case 7):
                purely a display convenience — the backend enforces the real
                rule on every request regardless of what this button shows. */}
            {can('users.manage') && <p data-testid="admin-badge">{t('roles.sys_admin.name')}</p>}
          </div>
        )}

        <LanguageSwitcher />

        {user && (
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {isLoggingOut ? t('auth.loggingOut') : t('auth.logout')}
          </button>
        )}
      </div>
    </header>
  );
}
