import { NavLink } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/auth/AuthContext';
import {
  Users, Calendar, LayoutDashboard,
  Map, FileText, ClipboardCheck, BookOpen, Clock, ShieldCheck,
  MessagesSquare, FolderGit2, BarChart3,
  GraduationCap, X, Monitor, Settings, Activity, Award, Building2, UserRound
} from 'lucide-react';

interface NavItem {
  path: string;
  label: string;
  icon: any;
  permission?: string | null;
  roles?: string[];
  customCheck?: () => boolean;
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
  const userRoles = (user?.roles ?? []).map(r => String(r).toUpperCase());
  const isSuperAdmin = userRoles.includes('SYS_ADMIN');
  const isClinicalSupervisor = userRoles.includes('CLINICAL_SUPERVISOR');
  const isDeptHead = userRoles.includes('DEPARTMENT_HEAD');
  const isClinicalDirector = userRoles.includes('CLINICAL_DIRECTOR');

  const getNavigation = (): NavSection[] => {
    // If user is purely a Supervisor and has no administrative roles
    const isOnlySupervisor = isClinicalSupervisor && !isSuperAdmin && !isClinicalDirector && !isDeptHead && !userRoles.some(r => ['DEAN', 'VICE_DEAN', 'ADMIN_ASSISTANT'].includes(r));
    if (isOnlySupervisor) {
      return [
        {
          title: locale === 'ar' ? 'التدريب السريري والتقييم' : 'Clinical Training & Grading',
          items: [
            { path: '/supervisor/portal', label: locale === 'ar' ? 'مساحة التدريب السريري' : 'Clinical Training Workspace', icon: ClipboardCheck, permission: 'supervisor.workspace.view' },
            { path: '/advising', label: locale === 'ar' ? 'الإرشاد الأكاديمي' : 'Academic Advising', icon: GraduationCap, permission: 'advising.view' },
          ]
        },
        {
          title: locale === 'ar' ? 'الملف الشخصي والمراسلات' : 'Profile & Messages',
          items: [
            { path: '/profile', label: locale === 'ar' ? 'ملفي الشخصي' : 'My Profile', icon: UserRound },
            { path: '/clinical-supervisors/me', label: locale === 'ar' ? 'بروفايلي السريري والـ Score' : 'My Clinical Profile', icon: Award },
            { path: '/inbox', label: locale === 'ar' ? 'المراسلات' : 'Mail', icon: MessagesSquare, permission: 'correspondence.view' },
            { path: '/tasks', label: locale === 'ar' ? 'المهام' : 'Tasks', icon: FolderGit2, permission: 'tasks.view' },
          ]
        }
      ];
    }

    // Full system navigation sections filtered strictly by dynamic permissions
    return [
      {
        title: locale === 'ar' ? 'الطلاب والتدريب السريري' : 'Students & Clinical',
        items: [
          { path: '/', label: locale === 'ar' ? 'لوحة التحكم' : 'Dashboard', icon: LayoutDashboard },
          { path: '/directory', label: locale === 'ar' ? 'دليل الطلاب' : 'Students Directory', icon: Users, permission: 'students.view' },
          { path: '/distribution', label: locale === 'ar' ? 'التوزيع السريري' : 'Distribution', icon: Map, permission: 'distribution.view' },
          { path: '/distribution/groups', label: locale === 'ar' ? 'تسجيل مجموعات الطلبة' : 'Student Group Registration', icon: GraduationCap, permission: 'group_registration.view' },
          { path: '/clinical/schedule', label: locale === 'ar' ? 'الجدول السريري' : 'Clinical Schedule', icon: Calendar, permission: 'clinical_schedule.view' },
          { path: '/supervisor/portal', label: locale === 'ar' ? 'مساحة عملي كمشرف سريري' : 'My Clinical Supervisor Workspace', icon: ClipboardCheck, customCheck: () => isClinicalSupervisor && can('supervisor.workspace.view') },
          { path: '/attendance', label: locale === 'ar' ? 'سجل الحضور والغياب' : 'Attendance Log', icon: Clock, permission: 'attendance.view' },
          { path: '/assessments', label: locale === 'ar' ? 'مراجعة التقييمات السريرية' : 'Clinical Assessment Review', icon: ClipboardCheck, permission: 'assessment.view' },
        ]
      },
      {
        title: locale === 'ar' ? 'الشؤون الأكاديمية والمساقات' : 'Academic Affairs',
        items: [
          { path: '/grades', label: locale === 'ar' ? 'سجل العلامات والاعتماد' : 'Grades Log', icon: ClipboardCheck, permission: 'grades.view' },
          { path: '/courses', label: locale === 'ar' ? 'مساقات الدائرة السريرية' : 'Clinical Courses', icon: BookOpen, permission: 'courses.view' },
          { path: '/advising', label: locale === 'ar' ? 'الإرشاد الأكاديمي' : 'Academic Advising', icon: Users, permission: 'advising.view' },
        ]
      },
      {
        title: locale === 'ar' ? 'الكادر ورؤساء الأقسام' : 'Staff & Department Heads',
        items: [
          { path: '/profile', label: locale === 'ar' ? 'ملفي الشخصي' : 'My Profile', icon: GraduationCap },
          { path: '/dept-heads/me', label: locale === 'ar' ? 'ملفي كرئيس قسم' : 'My Department-Head Profile', icon: GraduationCap, customCheck: () => isDeptHead },
          { path: '/department-heads', label: locale === 'ar' ? 'دليل رؤساء الأقسام' : 'Department Heads Directory', icon: Users, permission: 'people.view' },
          { path: '/clinical-supervisors', label: locale === 'ar' ? 'المستشفيات والمشرفون' : 'Hospitals & Supervisors', icon: ShieldCheck, permission: 'people.view' },
          { path: '/rta-assignments', label: locale === 'ar' ? 'تكليف مساعدي البحث والتدريس' : 'RTA Cohort Assignments', icon: Users, permission: 'rta_assignments.manage' },
        ]
      },
      {
        title: locale === 'ar' ? 'الجودة والتقارير' : 'Quality & Reports',
        items: [
          { path: '/quality', label: locale === 'ar' ? 'الجودة والاعتماد' : 'Quality & Accreditation', icon: BarChart3, permission: 'quality.view' },
          { path: '/academic/calendar', label: locale === 'ar' ? 'التقويم الأكاديمي' : 'Academic Calendar', icon: Calendar, permission: 'academic_years.manage' },
          { path: '/operational/reports', label: locale === 'ar' ? 'التقارير السنوية والإحصائيات' : 'Annual Reports', icon: FileText, permission: 'reports.view' },
        ]
      },
      {
        title: locale === 'ar' ? 'المراسلات والاجتماعات' : 'Governance & Meetings',
        items: [
          { path: '/inbox', label: locale === 'ar' ? 'المراسلات' : 'Mail', icon: MessagesSquare, permission: 'correspondence.view' },
          { path: '/meetings', label: locale === 'ar' ? 'محاضر الاجتماعات' : 'Meetings', icon: Calendar, permission: 'meetings.manage' },
          { path: '/tasks', label: locale === 'ar' ? 'المهام والتكليفات' : 'Tasks', icon: FolderGit2, permission: 'tasks.view' },
        ]
      },
      {
        title: locale === 'ar' ? 'إدارة النظام والأمان' : 'System Administration',
        items: [
          { path: '/users', label: locale === 'ar' ? 'المستخدمون والأدوار' : 'Users & Roles', icon: Users, permission: 'users.manage' },
          { path: '/admin/departments', label: locale === 'ar' ? 'إدارة أقسام الكلية والقيادات' : 'Departments & Leaders Management', icon: Building2, permission: 'users.manage' },
          { path: '/admin/permissions', label: locale === 'ar' ? 'مصفوفة الصلاحيات والشاشات' : 'Permission Matrix', icon: ShieldCheck, permission: 'roles.manage' },
          { path: '/admin/sessions', label: locale === 'ar' ? 'الجلسات والأمان الحية' : 'Active Sessions & Security', icon: Monitor, permission: 'users.manage' },
          { path: '/admin/health', label: locale === 'ar' ? 'مراقبة صحة السيرفر' : 'System Health Monitor', icon: Activity, permission: 'settings.manage' },
          { path: '/admin/settings', label: locale === 'ar' ? 'إعدادات النظام والنسخ الاحتياطي' : 'System Settings & Backup', icon: Settings, permission: 'settings.manage' },
          { path: '/audit-logs', label: locale === 'ar' ? 'سجل العمليات والتدقيق' : 'Audit Logs', icon: ShieldCheck, permission: 'audit.view' },
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
        {/* Mobile Drawer Header */}
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
              if (item.customCheck) return item.customCheck();
              if (item.permission) return can(item.permission);
              if (item.roles && item.roles.length > 0) {
                return item.roles.some(r => userRoles.includes(r.toUpperCase()));
              }
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
                                ? 'bg-teal-600 text-white shadow-md shadow-teal-600/30'
                                : 'bg-white text-teal-600 shadow-xs border border-slate-100'
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
