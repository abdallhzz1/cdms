import { NavLink } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/auth/AuthContext';
import { 
  Users, Calendar, LayoutDashboard, 
  Map, FileText, ClipboardCheck, BookOpen, Clock, ShieldCheck,
  MessagesSquare, FolderGit2, BarChart3, Send, AlertTriangle, TrendingUp, Target
} from 'lucide-react';

interface NavItem {
  path: string;
  label: string;
  icon: any;
  permission?: string | null;
  roles?: string[];
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export function Sidebar() {
  const { t, locale } = useI18n();
  const { can, user } = useAuth();

  const userRoles = user?.roles ?? [];
  const isSuperAdmin = userRoles.includes('SYS_ADMIN');
  const isSupervisorOnly = userRoles.includes('CLINICAL_SUPERVISOR') && !userRoles.some(r => ['CLINICAL_DIRECTOR', 'ADMIN_ASSISTANT', 'SYS_ADMIN', 'DEAN', 'VICE_DEAN'].includes(r));
  const isAdvisorOnly = userRoles.includes('ACADEMIC_ADVISOR') && !userRoles.some(r => ['CLINICAL_DIRECTOR', 'ADMIN_ASSISTANT', 'SYS_ADMIN', 'DEAN', 'VICE_DEAN'].includes(r));
  const isQualityOnly = userRoles.includes('QUALITY') && !userRoles.some(r => ['CLINICAL_DIRECTOR', 'ADMIN_ASSISTANT', 'SYS_ADMIN', 'DEAN', 'VICE_DEAN'].includes(r));
  const isHeadOnly = userRoles.includes('DEPARTMENT_HEAD') && !userRoles.some(r => ['CLINICAL_DIRECTOR', 'ADMIN_ASSISTANT', 'SYS_ADMIN', 'DEAN', 'VICE_DEAN'].includes(r));

  const getNavigation = (): NavSection[] => {
    // 1. المشرف السريري فقط (Clinical Supervisor Portal View)
    if (isSupervisorOnly) {
      return [
        {
          title: locale === 'ar' ? 'التدريب السريري' : 'Clinical Training',
          items: [
            { path: '/supervisor/portal', label: locale === 'ar' ? 'بوابة المشرف السريري' : 'Supervisor Portal', icon: BookOpen },
            { path: '/attendance', label: locale === 'ar' ? 'سجل الحضور' : 'Attendance', icon: Clock, permission: 'attendance.view' },
            { path: '/assessments', label: locale === 'ar' ? 'التقييمات السريرية' : 'Assessments', icon: ClipboardCheck, permission: 'assessment.view' },
            { path: '/skill-logbook', label: locale === 'ar' ? 'سجل المهارات' : 'Skill Logbook', icon: FileText, permission: 'assessment.view' },
          ]
        },
        {
          title: locale === 'ar' ? 'المراسلات والمهام' : 'Messages & Tasks',
          items: [
            { path: '/inbox', label: locale === 'ar' ? 'صندوق الوارد' : 'Inbox', icon: MessagesSquare, permission: 'correspondence.view' },
            { path: '/outbox', label: locale === 'ar' ? 'الطلبات الصادرة' : 'Outbox', icon: Send, permission: 'correspondence.view' },
            { path: '/tasks', label: locale === 'ar' ? 'المهام' : 'Tasks', icon: FolderGit2, permission: 'tasks.view' },
          ]
        }
      ];
    }

    // 2. المرشد الأكاديمي فقط (Academic Advisor View)
    if (isAdvisorOnly) {
      return [
        {
          title: locale === 'ar' ? 'الإرشاد الأكاديمي' : 'Academic Advising',
          items: [
            { path: '/advising', label: locale === 'ar' ? 'لوحة تحكم الإرشاد' : 'Advising Dashboard', icon: LayoutDashboard, permission: 'advising.view' },
            { path: '/advising/logs', label: locale === 'ar' ? 'سجل الجلسات' : 'Session Logs', icon: FileText, permission: 'advising.view' },
            { path: '/advising/early-warning', label: locale === 'ar' ? 'الإنذار المبكر' : 'Early Warning', icon: AlertTriangle, permission: 'advising.view' },
            { path: '/directory', label: locale === 'ar' ? 'طلابي المسترشدين' : 'My Advisees', icon: Users, permission: 'students.view' },
          ]
        },
        {
          title: locale === 'ar' ? 'المراسلات والمهام' : 'Messages & Tasks',
          items: [
            { path: '/inbox', label: locale === 'ar' ? 'صندوق الوارد' : 'Inbox', icon: MessagesSquare, permission: 'correspondence.view' },
            { path: '/outbox', label: locale === 'ar' ? 'الطلبات الصادرة' : 'Outbox', icon: Send, permission: 'correspondence.view' },
            { path: '/tasks', label: locale === 'ar' ? 'المهام' : 'Tasks', icon: FolderGit2, permission: 'tasks.view' },
          ]
        }
      ];
    }

    // 3. دائرة الجودة فقط (Quality Assurance View)
    if (isQualityOnly) {
      return [
        {
          title: locale === 'ar' ? 'الجودة والتقييم' : 'Quality Assurance',
          items: [
            { path: '/quality', label: locale === 'ar' ? 'لوحة الجودة' : 'Quality Dashboard', icon: BarChart3, permission: 'quality.view' },
            { path: '/quality/surveys', label: locale === 'ar' ? 'الاستبيانات' : 'Surveys', icon: ClipboardCheck, permission: 'quality.view' },
            { path: '/quality/improvement', label: locale === 'ar' ? 'خطط التحسين' : 'Improvement Plans', icon: TrendingUp, permission: 'quality.view' },
            { path: '/quality/kpis', label: locale === 'ar' ? 'مؤشرات الجودة' : 'KPIs', icon: Target, permission: 'quality.view' },
            { path: '/operational/reports', label: locale === 'ar' ? 'تقارير الجودة والبيانات' : 'Quality Reports', icon: BarChart3, permission: 'reports.view' },
          ]
        },
        {
          title: locale === 'ar' ? 'المراسلات والمهام' : 'Messages & Tasks',
          items: [
            { path: '/inbox', label: locale === 'ar' ? 'صندوق الوارد' : 'Inbox', icon: MessagesSquare, permission: 'correspondence.view' },
            { path: '/outbox', label: locale === 'ar' ? 'الطلبات الصادرة' : 'Outbox', icon: Send, permission: 'correspondence.view' },
            { path: '/tasks', label: locale === 'ar' ? 'المهام' : 'Tasks', icon: FolderGit2, permission: 'tasks.view' },
          ]
        }
      ];
    }

    // 4. رئيس القسم فقط (Department Head View)
    if (isHeadOnly) {
      return [
        {
          title: locale === 'ar' ? 'إدارة القسم' : 'Department Management',
          items: [
            { path: '/', label: locale === 'ar' ? 'لوحة تحكم القسم' : 'Department Dashboard', icon: LayoutDashboard },
            { path: '/study-plans', label: locale === 'ar' ? 'مساقات القسم' : 'Courses', icon: FileText, permission: 'courses.view' },
            { path: '/grades', label: locale === 'ar' ? 'العلامات والاعتماد' : 'Grades & Approvals', icon: ClipboardCheck, permission: 'grades.view' },
            { path: '/clinical/schedule', label: locale === 'ar' ? 'جدول القسم السريري' : 'Clinical Schedule', icon: Calendar, permission: 'distribution.view' },
            { path: '/directory', label: locale === 'ar' ? 'مشرفو وطلاب القسم' : 'Supervisors & Students', icon: Users, permission: 'people.view' },
          ]
        },
        {
          title: locale === 'ar' ? 'المراسلات والاجتماعات' : 'Messages & Meetings',
          items: [
            { path: '/inbox', label: locale === 'ar' ? 'صندوق الوارد' : 'Inbox', icon: MessagesSquare, permission: 'correspondence.view' },
            { path: '/outbox', label: locale === 'ar' ? 'الطلبات الصادرة' : 'Outbox', icon: Send, permission: 'correspondence.view' },
            { path: '/meetings', label: locale === 'ar' ? 'الاجتماعات' : 'Meetings', icon: Calendar, permission: 'meetings.manage' },
            { path: '/tasks', label: locale === 'ar' ? 'المهام' : 'Tasks', icon: FolderGit2, permission: 'tasks.view' },
            { path: '/operational/reports', label: locale === 'ar' ? 'التقارير' : 'Reports', icon: BarChart3, permission: 'reports.view' },
          ]
        }
      ];
    }

    // 5. مدير النظام فقط (System Administrator Technical View)
    if (isSuperAdmin && userRoles.length === 1) {
      return [
        {
          title: locale === 'ar' ? 'إدارة النظام' : 'System Administration',
          items: [
            { path: '/', label: locale === 'ar' ? 'الرئيسية' : 'Dashboard', icon: LayoutDashboard },
            { path: '/users', label: locale === 'ar' ? 'إدارة المستخدمين والأدوار' : 'Users & Roles', icon: ShieldCheck, permission: 'users.manage' },
            { path: '/academic/calendar', label: locale === 'ar' ? 'التقويم الأكاديمي' : 'Calendar', icon: Calendar, permission: 'academic_years.manage' },
            { path: '/audit-logs', label: locale === 'ar' ? 'سجل العمليات والتدقيق' : 'Audit Logs', icon: FileText, permission: 'audit.view' },
            { path: '/operational/reports', label: locale === 'ar' ? 'مركز التقارير وتصدير البيانات' : 'Reports Hub', icon: BarChart3, permission: 'reports.view' },
          ]
        }
      ];
    }

    // 6. الإدارة والقيادة المركزية (Clinical Director, Dean, Vice Dean, Admin Assistant, Leadership)
    return [
      {
        title: locale === 'ar' ? 'الشؤون الأكاديمية والطلبة' : 'Academic & Students',
        items: [
          { path: '/', label: locale === 'ar' ? 'لوحة التحكم المركزية' : 'Main Dashboard', icon: LayoutDashboard },
          { path: '/directory', label: locale === 'ar' ? 'الطلاب والدفعات السريرية' : 'Students & Cohorts', icon: Users, permission: 'students.view' },
          { path: '/study-plans', label: locale === 'ar' ? 'الخطط والمساقات الدراسية' : 'Curriculum & Courses', icon: FileText, permission: 'courses.view' },
          { path: '/grades', label: locale === 'ar' ? 'رصد واعتماد العلامات' : 'Grades & Approvals', icon: ClipboardCheck, permission: 'grades.view' },
        ]
      },
      {
        title: locale === 'ar' ? 'التدريب السريري' : 'Clinical Training',
        items: [
          { path: '/distribution', label: locale === 'ar' ? 'توزيع الطلبة على المستشفيات' : 'Hospital Placements', icon: Map, permission: 'distribution.view' },
          { path: '/clinical/schedule', label: locale === 'ar' ? 'الجدول السريري العام' : 'Master Schedule', icon: Calendar, permission: 'distribution.view' },
          { path: '/attendance', label: locale === 'ar' ? 'سجل الحضور والغياب' : 'Attendance Records', icon: Clock, permission: 'attendance.view' },
          { path: '/assessments', label: locale === 'ar' ? 'التقييمات السريرية' : 'Assessments', icon: ClipboardCheck, permission: 'assessment.view' },
          { path: '/skill-logbook', label: locale === 'ar' ? 'سجل المهارات (Logbook)' : 'Skill Logbook', icon: FileText, permission: 'assessment.view' },
          { path: '/supervisor/portal', label: locale === 'ar' ? 'بوابة المشرف' : 'Supervisor Portal', icon: BookOpen, roles: ['CLINICAL_SUPERVISOR'] },
        ]
      },
      {
        title: locale === 'ar' ? 'الإرشاد الأكاديمي' : 'Academic Advising',
        items: [
          { path: '/advising', label: locale === 'ar' ? 'لوحة تحكم الإرشاد' : 'Advising Dashboard', icon: LayoutDashboard, permission: 'advising.view' },
          { path: '/advising/assignments', label: locale === 'ar' ? 'تعيين المرشدين' : 'Advisor Assignments', icon: Users, permission: 'advising.manage' },
          { path: '/advising/logs', label: locale === 'ar' ? 'سجل الجلسات' : 'Session Logs', icon: FileText, permission: 'advising.view' },
          { path: '/advising/early-warning', label: locale === 'ar' ? 'الإنذار المبكر والتعثر' : 'Early Warning', icon: AlertTriangle, permission: 'advising.view' },
        ]
      },
      {
        title: locale === 'ar' ? 'المراسلات والعمليات الإدارية' : 'Correspondence & Operations',
        items: [
          { path: '/inbox', label: locale === 'ar' ? 'صندوق الوارد' : 'Inbox', icon: MessagesSquare, permission: 'correspondence.view' },
          { path: '/outbox', label: locale === 'ar' ? 'الطلبات الصادرة' : 'Outbox', icon: Send, permission: 'correspondence.view' },
          { path: '/tasks', label: locale === 'ar' ? 'المهام والتكليفات' : 'Tasks', icon: FolderGit2, permission: 'tasks.view' },
          { path: '/meetings', label: locale === 'ar' ? 'الاجتماعات والمحاضر' : 'Meetings & Minutes', icon: Calendar, permission: 'meetings.manage' },
          { path: '/operational/reports', label: locale === 'ar' ? 'مركز التقارير وتصدير البيانات' : 'Reports Hub', icon: BarChart3, permission: 'reports.view' },
        ]
      },
      {
        title: locale === 'ar' ? 'الجودة والتقويم' : 'Quality & Improvement',
        items: [
          { path: '/quality', label: locale === 'ar' ? 'لوحة تحكم الجودة' : 'Quality Dashboard', icon: BarChart3, permission: 'quality.view' },
          { path: '/quality/surveys', label: locale === 'ar' ? 'الاستبيانات' : 'Surveys', icon: ClipboardCheck, permission: 'quality.view' },
          { path: '/quality/improvement', label: locale === 'ar' ? 'خطط التحسين' : 'Improvement Plans', icon: TrendingUp, permission: 'quality.view' },
          { path: '/quality/kpis', label: locale === 'ar' ? 'مؤشرات الأداء (KPIs)' : 'KPIs', icon: Target, permission: 'quality.view' },
        ]
      },
      {
        title: locale === 'ar' ? 'الإدارة والإعدادات' : 'Administration',
        items: [
          { path: '/users', label: locale === 'ar' ? 'المستخدمين والصلاحيات' : 'Users & Roles', icon: ShieldCheck, permission: 'users.manage' },
          { path: '/academic/calendar', label: locale === 'ar' ? 'التقويم الأكاديمي' : 'Academic Calendar', icon: Calendar, permission: 'academic_years.manage' },
          { path: '/audit-logs', label: locale === 'ar' ? 'سجل العمليات والتدقيق' : 'Audit Logs', icon: FileText, permission: 'audit.view' },
        ]
      }
    ];
  };

  const navigation = getNavigation();

  return (
    <nav aria-label={t('nav.dashboard')} className="hidden w-64 shrink-0 border-e border-slate-200 bg-white p-4 sm:block flex-col h-full overflow-y-auto">
      <div className="space-y-8">
        {navigation.map((section, idx) => {
          const visibleItems = section.items.filter((item) => {
            if (item.roles && !item.roles.some((r: string) => userRoles.includes(r))) {
              return false;
            }
            if (item.permission && !can(item.permission)) {
              return false;
            }
            return true;
          });
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
                        `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-200 ${
                          isActive
                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                            : 'text-slate-500 hover:bg-slate-50 hover:text-indigo-600'
                        }`
                      }
                    >
                      <Icon className="h-5 w-5 shrink-0" strokeWidth={2.5} />
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
