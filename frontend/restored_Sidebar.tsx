import { NavLink } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/auth/AuthContext';
import { 
  Users, Calendar, GraduationCap, LayoutDashboard, 
  Map, FileText, ClipboardCheck, BookOpen, Clock, Settings, Building, ShieldCheck,
  MessagesSquare, FolderGit2, BarChart3, Send
} from 'lucide-react';

export function Sidebar() {
  const { t } = useI18n();
  const { can } = useAuth();

  const navigation = [
    {
      title: t('nav.section.academic', 'الشؤون الأكاديمية'),
      items: [
        { path: '/', label: t('nav.dashboard', 'لوحة التحكم'), icon: LayoutDashboard, permission: 'dashboard.view' },
        { path: '/study-plans', label: t('nav.study_plans', 'الخطط الدراسية'), icon: FileText, permission: 'courses.view' },
        { path: '/grades', label: t('nav.grades', 'العلامات'), icon: ClipboardCheck, permission: 'grades.view' },
        { path: '/directory', label: t('nav.directory', 'الدليل الأكاديمي'), icon: Users, permission: 'students.view' },
      ]
    },
    {
      title: t('nav.section.clinical', 'التدريب السريري'),
      items: [
        { path: '/distribution', label: t('nav.distribution', 'توزيع الطلبة'), icon: Map, permission: 'distribution.view' },
        { path: '/clinical/schedule', label: t('nav.clinical_schedule', 'الجدول السريري'), icon: Calendar, permission: 'distribution.view' },
        { path: '/attendance', label: t('nav.attendance', 'الحضور والغياب'), icon: Clock, permission: 'attendance.view' },
        { path: '/assessments', label: t('nav.assessments', 'التقييم السريري'), icon: ClipboardCheck, permission: 'assessments.view' },
        { path: '/supervisor/portal', label: t('nav.supervisor_portal', 'بوابة المشرف'), icon: BookOpen, permission: 'distribution.view' },
      ]
    },
    {
      title: t('nav.section.reports', 'المراسلات والتقارير'),
      items: [
        { path: '/inbox', label: t('nav.inbox', 'صندوق الوارد'), icon: MessagesSquare, permission: 'correspondence.view' },
        { path: '/outbox', label: t('nav.outbox', 'الطلبات الصادرة'), icon: Send, permission: 'correspondence.view' },
        { path: '/tasks', label: t('nav.tasks', 'المهام'), icon: FolderGit2, permission: 'tasks.view' },
        { path: '/meetings', label: t('nav.meetings', 'الاجتماعات'), icon: Calendar, permission: 'meetings.manage' },
        { path: '/operational/reports', label: t('nav.reports', 'التقارير التشغيلية'), icon: BarChart3, permission: 'reports.view' },
        { path: '/quality/surveys', label: t('nav.quality', 'استبيانات الجودة'), icon: ClipboardCheck, permission: 'quality.view' },
      ]
    },
    {
      title: t('nav.section.admin', 'الإدارة والإعدادات'),
      items: [
        { path: '/users', label: t('nav.users', 'إدارة المستخدمين'), icon: ShieldCheck, permission: 'users.manage' },
        { path: '/academic/calendar', label: t('nav.calendar', 'التقويم الجامعي'), icon: Calendar, permission: 'calendar.manage' },
      ]
    }
  ];

  return (
    <nav aria-label={t('nav.dashboard')} className="hidden w-64 shrink-0 border-e border-slate-200 bg-white p-4 sm:block flex-col h-full overflow-y-auto">
      <div className="space-y-8">
        {navigation.map((section, idx) => {
          const visibleItems = section.items.filter(item => can(item.permission));
          if (visibleItems.length === 0) return null;
          
          return (
            <div key={idx}>
              <h3 className="px-3 text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                {section.title}
              </h3>
              <div className="space-y-1">
                {visibleItems.map(item => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={({ isActive }) =>
                        `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 ${
                          isActive
                            ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        }`
                      }
                    >
                      <Icon className="h-5 w-5 opacity-75" />
                      {item.label}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </nav>
  );
}