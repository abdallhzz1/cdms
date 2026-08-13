import { NavLink } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nContext';

/**
 * Structural placeholder only. Real business navigation (Students, Grades,
 * Distribution, ...) is built module-by-module in later phases against the
 * approved UI/UX Screen_Map/Navigation sheets — see ARCHITECTURE.md §6.
 * This sidebar exists to prove the app shell's responsive layout works.
 */
export function Sidebar() {
  const { t } = useI18n();

  return (
    <nav
      aria-label={t('nav.dashboard')}
      className="hidden w-56 shrink-0 border-e border-slate-200 bg-slate-50 p-4 sm:block"
    >
      <NavLink
        to="/"
        end
        className={({ isActive }) =>
          `block rounded-md px-3 py-2 text-sm font-medium ${
            isActive ? 'bg-slate-200 text-slate-900' : 'text-slate-600 hover:bg-slate-100'
          }`
        }
      >
        {t('nav.dashboard')}
      </NavLink>
    </nav>
  );
}
