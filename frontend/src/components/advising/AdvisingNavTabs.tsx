import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, AlertTriangle, FileCheck } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/auth/AuthContext';

export function AdvisingNavTabs() {
  const { locale } = useI18n();
  const { can } = useAuth();
  const location = useLocation();

  const tabs = [
    {
      path: '/advising',
      exact: true,
      label: locale === 'ar' ? 'لوحة التحكم' : 'Overview',
      icon: LayoutDashboard,
      show: true,
    },
    {
      path: '/advising/assignments',
      exact: false,
      label: locale === 'ar' ? 'تعيين المرشدين' : 'Advisor Assignments',
      icon: Users,
      show: can('advising.manage'),
    },
    {
      path: '/advising/forms',
      exact: false,
      label: locale === 'ar' ? 'محاضر ونماذج الإرشاد' : 'Advising Forms & Records',
      icon: FileCheck,
      show: true,
    },
    {
      path: '/advising/early-warning',
      exact: false,
      label: locale === 'ar' ? 'الإنذار المبكر' : 'Early Warning',
      icon: AlertTriangle,
      show: true,
    },
  ];

  return (
    <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-1.5 overflow-x-auto scrollbar-none">
      {tabs.filter(t => t.show).map((t) => {
        const isActive = t.exact ? location.pathname === t.path : location.pathname.startsWith(t.path);
        const Icon = t.icon;
        return (
          <Link
            key={t.path}
            to={t.path}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
              isActive
                ? 'bg-teal-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{t.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
