import { NavLink } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/auth/AuthContext';
import { 
  Users, Calendar, LayoutDashboard, 
  Map, FileText, ClipboardCheck, BookOpen, Clock, ShieldCheck,
  MessagesSquare, FolderGit2, BarChart3, Send, AlertTriangle, TrendingUp, Target,
  X
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

interface SidebarProps {
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export function Sidebar({ isOpenMobile, onCloseMobile }: SidebarProps) {
  const { locale } = useI18n();
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
            { path: '/advising/logs', label: locale === 'ar' ? 'سجل جلسات الإرشاد' : 'Advising Sessions', icon: BookOpen, permission: 'advising.view' },
            { path: '/advising/early-warning', label: locale === 'ar' ? 'الإنذار المبكر والتعثر' : 'Early Warning', icon: AlertTriangle, permission: 'advising.view' },
            { path: '/advising/assignments', label: locale === 'ar' ? 'طلبتي المسترشدين' : 'My Advisees', icon: Users, permission: 'advising.view' },
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

    // 3. دائرة الجودة فقط (Quality & Accreditation View)
    if (isQualityOnly) {
      return [
        {
          title: locale === 'ar' ? 'الجودة والتقييم' : 'Quality & Evaluation',
          items: [
            { path: '/quality', label: locale === 'ar' ? 'لوحة تحكم الجودة' : 'Quality Dashboard', icon: BarChart3, permission: 'quality.view' },
            { path: '/quality/surveys', label: locale === 'ar' ? 'إدارة الاستبيانات' : 'Surveys', icon: ClipboardCheck, permission: 'quality.view' },
            { path: '/quality/improvement', label: locale === 'ar' ? 'خطط التحسين' : 'Improvement Plans', icon: TrendingUp, permission: 'quality.view' },
            { path: '/quality/kpis', label: locale === 'ar' ? 'مؤشرات الأداء (KPIs)' : 'Quality KPIs', icon: Target, permission: 'quality.view' },
            { path: '/evaluations', label: locale === 'ar' ? 'نماذج تقييم المشرفين' : 'Evaluation Forms', icon: FileText, permission: 'assessment.create' },
            { path: '/operational/reports', label: locale === 'ar' ? 'تقارير الجودة' : 'Quality Reports', icon: FileText, permission: 'reports.view' },
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
            { path: '/study-plans', label: locale === 'ar' ? 'مساقات القسم والخطط' : 'Courses & Plans', icon: BookOpen, permission: 'courses.view' },
            { path: '/grades', label: locale === 'ar' ? 'العلامات والاعتماد' : 'Grades & Approvals', icon: ClipboardCheck, permission: 'grades.view' },
            { path: '/clinical/schedule', label: locale === 'ar' ? 'جدول التدريب السريري' : 'Clinical Schedule', icon: Calendar, permission: 'clinical.schedule.view' },
            { path: '/directory', label: locale === 'ar' ? 'طلبة ومشرفو القسم' : 'Staff & Students', icon: Users, permission: 'students.view' },
          ]
        },
        {
          title: locale === 'ar' ? 'الاجتماعات والمراسلات' : 'Meetings & Ops',
          items: [
            { path: '/meetings', label: locale === 'ar' ? 'مجلس القسم والاجتماعات' : 'Department Meetings', icon: Calendar, permission: 'meetings.manage' },
            { path: '/inbox', label: locale === 'ar' ? 'صندوق الوارد' : 'Inbox', icon: MessagesSquare, permission: 'correspondence.view' },
            { path: '/outbox', label: locale === 'ar' ? 'الطلبات الصادرة' : 'Outbox', icon: Send, permission: 'correspondence.view' },
            { path: '/tasks', label: locale === 'ar' ? 'المهام' : 'Tasks', icon: FolderGit2, permission: 'tasks.view' },
            { path: '/operational/reports', label: locale === 'ar' ? 'تقارير القسم' : 'Reports', icon: FileText, permission: 'reports.view' },
          ]
        }
      ];
    }

    // 5. مدير النظام التقني (System Admin View)
    if (isSuperAdmin) {
      return [
        {
          title: locale === 'ar' ? 'إدارة النظام والأمان' : 'System Administration',
          items: [
            { path: '/', label: locale === 'ar' ? 'لوحة العمليات' : 'Dashboard', icon: LayoutDashboard },
            { path: '/users', label: locale === 'ar' ? 'المستخدمون والأدوار' : 'Users & Roles', icon: Users, permission: 'users.manage' },
            { path: '/academic/calendar', label: locale === 'ar' ? 'التقويم الأكاديمي' : 'Academic Calendar', icon: Calendar, permission: 'academic_years.manage' },
            { path: '/audit-logs', label: locale === 'ar' ? 'سجل العمليات والتدقيق' : 'Audit Logs', icon: ShieldCheck, permission: 'users.manage' },
            { path: '/operational/reports', label: locale === 'ar' ? 'مركز التقارير' : 'Reports Hub', icon: FileText, permission: 'reports.view' },
          ]
        }
      ];
    }

    // 6. الإدارة السريرية والعمادة (Clinical Director / Dean / Vice Dean / Admin Assistant)
    return [
      {
        title: locale === 'ar' ? 'الطلاب والتدريب السريري' : 'Students & Clinical',
        items: [
          { path: '/', label: locale === 'ar' ? 'لوحة التحكم' : 'Dashboard', icon: LayoutDashboard },
          { path: '/directory', label: locale === 'ar' ? 'دليل الطلاب' : 'Students Directory', icon: Users, permission: 'students.view' },
          { path: '/distribution', label: locale === 'ar' ? 'التوزيع السريري' : 'Distribution', icon: Map, permission: 'distribution.view' },
          { path: '/clinical/schedule', label: locale === 'ar' ? 'الجدول السريري' : 'Clinical Schedule', icon: Calendar, permission: 'clinical.schedule.view' },
        ]
      },
      {
        title: locale === 'ar' ? 'الشؤون الأكاديمية' : 'Academic Affairs',
        items: [
          { path: '/grades', label: locale === 'ar' ? 'سجل العلامات' : 'Grades Log', icon: ClipboardCheck, permission: 'grades.view' },
          { path: '/study-plans', label: locale === 'ar' ? 'المساقات والخطط' : 'Courses & Plans', icon: BookOpen, permission: 'courses.view' },
          { path: '/advising', label: locale === 'ar' ? 'الإرشاد الأكاديمي' : 'Academic Advising', icon: Users, permission: 'advising.view' },
        ]
      },
      {
        title: locale === 'ar' ? 'الكادر ورؤساء الأقسام' : 'Staff & Department Heads',
        items: [
          { path: '/staff-allocations', label: locale === 'ar' ? 'رؤساء الأقسام' : 'Department Heads', icon: Users, permission: 'students.view' },
          { path: '/supervisor-workloads', label: locale === 'ar' ? 'المشرفون السريريون' : 'Clinical Supervisors', icon: ShieldCheck, permission: 'students.view' },
        ]
      },
      {
        title: locale === 'ar' ? 'الجودة والتقارير' : 'Quality & Reports',
        items: [
          { path: '/quality', label: locale === 'ar' ? 'الجودة والاعتماد' : 'Quality & Accreditation', icon: BarChart3, permission: 'quality.view' },
          { path: '/academic/calendar', label: locale === 'ar' ? 'التقويم الأكاديمي' : 'Academic Calendar', icon: Calendar, permission: 'academic_years.manage' },
          { path: '/operational/reports', label: locale === 'ar' ? 'التقارير السنوية' : 'Annual Reports', icon: FileText, permission: 'reports.view' },
        ]
      },
      {
        title: locale === 'ar' ? 'المراسلات والاجتماعات' : 'Governance & Meetings',
        items: [
          { path: '/inbox', label: locale === 'ar' ? 'صندوق الوارد' : 'Inbox', icon: MessagesSquare, permission: 'correspondence.view' },
          { path: '/outbox', label: locale === 'ar' ? 'الطلبات الصادرة' : 'Outbox', icon: Send, permission: 'correspondence.view' },
          { path: '/meetings', label: locale === 'ar' ? 'محاضر الاجتماعات' : 'Meetings', icon: Calendar, permission: 'meetings.manage' },
          { path: '/tasks', label: locale === 'ar' ? 'المهام والتكليفات' : 'Tasks', icon: FolderGit2, permission: 'tasks.view' },
        ]
      }
    ];
  };

  const sections = getNavigation();

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpenMobile && (
        <div 
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs md:hidden transition-opacity"
        />
      )}

      {/* Sidebar Content */}
      <aside
        className={`fixed md:static inset-y-0 z-40 w-72 max-w-[85vw] bg-white border-e border-slate-200/80 flex flex-col transition-transform duration-200 ease-in-out md:translate-x-0 ${
          isOpenMobile 
            ? 'translate-x-0 shadow-2xl' 
            : locale === 'ar' ? 'translate-x-full md:translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Mobile Drawer Header with Close Button */}
        <div className="md:hidden flex items-center justify-between p-3.5 border-b border-slate-100">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{locale === 'ar' ? 'القائمة الرئيسية' : 'Navigation Menu'}</span>
          <button onClick={onCloseMobile} className="p-1 rounded-lg text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Sections */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {sections.map((section, idx) => {
            const filteredItems = section.items.filter(item => {
              if (item.permission && !can(item.permission)) return false;
              return true;
            });

            if (filteredItems.length === 0) return null;

            return (
              <div key={idx} className="space-y-1">
                <h2 className="px-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  {section.title}
                </h2>
                <div className="space-y-0.5 pt-1">
                  {filteredItems.map(item => {
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        onClick={onCloseMobile}
                        className={({ isActive }) =>
                          `flex items-center gap-3.5 px-3 py-2 rounded-2xl text-sm font-semibold transition-all ${
                            isActive
                              ? 'bg-white text-slate-800 font-bold shadow-md shadow-slate-200/60'
                              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/60'
                          }`
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                              isActive
                                ? 'bg-teal-400 text-white shadow-md shadow-teal-400/30'
                                : 'bg-white text-teal-500 shadow-xs border border-slate-100'
                            }`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <span className="truncate">{item.label}</span>
                          </>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}
