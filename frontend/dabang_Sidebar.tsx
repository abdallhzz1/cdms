import { NavLink } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { 
  LayoutDashboard, Users, UserCog, Calendar, GraduationCap, 
  Settings, LogOut, CheckSquare, ClipboardList, BookOpen,
  LineChart, FolderGit2, MessagesSquare, BarChart3, Building
} from 'lucide-react';

export function Sidebar() {
  const { can } = useAuth();
  const { t } = useI18n();

  const menuGroups = [
    {
      title: t('nav.section.dashboard', 'لوحة التحكم'),
      items: [
        { path: '/operational/dashboard', label: t('nav.dashboard', 'الرئيسية'), icon: LayoutDashboard },
        { path: '/distribution', label: t('nav.distribution', 'التوزيع السريري'), icon: Calendar, permission: 'distribution.view' },
      ]
    },
    {
      title: t('nav.section.people', 'الطلبة والأشخاص'),
      items: [
        { path: '/students', label: t('nav.students', 'الطلبة'), icon: Users, permission: 'students.view' },
        { path: '/supervisors', label: t('nav.supervisor', 'المشرفون'), icon: UserCog, permission: 'people.view' },
        { path: '/departments', label: t('nav.departments', 'الأقسام'), icon: Building, permission: 'departments.view' },
      ]
    },
    {
      title: t('nav.section.academic', 'الشؤون الأكاديمية'),
      items: [
        { path: '/courses', label: t('nav.courses', 'المساقات'), icon: BookOpen, permission: 'courses.view' },
        { path: '/grades', label: t('nav.grades', 'العلامات'), icon: LineChart, permission: 'grades.view' },
        { path: '/attendance', label: t('nav.attendance', 'الحضور'), icon: CheckSquare, permission: 'attendance.view' },
        { path: '/assessments', label: t('nav.assessments', 'التقييمات'), icon: ClipboardList, permission: 'assessment.view' },
      ]
    },
    {
      title: t('nav.section.reports', 'التقارير والمتابعة'),
      items: [
        { path: '/tasks', label: t('nav.tasks', 'المهام'), icon: FolderGit2, permission: 'tasks.view' },
        { path: '/meetings', label: t('nav.meetings', 'الاجتماعات'), icon: MessagesSquare, permission: 'meetings.manage' },
        { path: '/operational/reports', label: t('nav.reports', 'التقارير التشغيلية'), icon: BarChart3, permission: 'reports.view' },
      ]
    }
  ];

  return (
    <nav
      aria-label={t('nav.dashboard')}
      className="hidden w-64 shrink-0 border-e border-slate-200 bg-white p-4 sm:block overflow-y-auto"
      style={{ height: 'calc(100vh - 72px)' }}
    >
      <div className="space-y-8">
        {menuGroups.map((group, idx) => (
          <div key={idx}>
            <h3 className="mb-3 px-3 text-xs font-bold uppercase tracking-wider text-slate-400">
              {group.title}
            </h3>
            <div className="space-y-1.5">
              {group.items.map((item) => {
                if (item.permission && !can(item.permission)) return null;
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-200 ${
                        isActive
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                          : 'text-slate-500 hover:bg-slate-50 hover:text-indigo-600'
                      }`
                    }
                  >
                    <Icon className="h-5 w-5 shrink-0" strokeWidth={2.5} />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}