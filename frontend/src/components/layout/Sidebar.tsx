import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/auth/AuthContext';
import {
  Users, Calendar, LayoutDashboard,
  Map, FileText, ClipboardCheck, BookOpen, Clock, ShieldCheck,
  MessagesSquare, FolderGit2, BarChart3,
  GraduationCap, X, Monitor, Settings, Activity, Building2, UserRound, GitBranch,
  ChevronDown, PanelLeftClose, PanelLeftOpen
} from 'lucide-react';
import hebronLogo from '@/assets/hebron.png';

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
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export function Sidebar({ isOpenMobile, onCloseMobile, isCollapsed = false, onToggleCollapsed }: SidebarProps) {
  const { locale } = useI18n();
  const { can, user } = useAuth();
  const userRoles = (user?.roles ?? []).map(r => String(r).toUpperCase());
  const isClinicalSupervisor = userRoles.includes('CLINICAL_SUPERVISOR');
  const [closedSections, setClosedSections] = useState<Set<number>>(new Set());

  const getNavigation = (): NavSection[] => {
    // If user is purely a Supervisor and has no administrative roles
    const isOnlySupervisor = isClinicalSupervisor && userRoles.length === 1;
    if (isOnlySupervisor) {
      return [
        {
          title: locale === 'ar' ? 'التدريب السريري والتقييم' : 'Clinical Training & Grading',
          items: [
            { path: '/supervisor/portal', label: locale === 'ar' ? 'لوحة المشرف' : 'Supervisor Dashboard', icon: LayoutDashboard, permission: 'supervisor.workspace.view' },
            { path: '/supervisor/attendance', label: locale === 'ar' ? 'الحضور والغياب' : 'Attendance', icon: Clock, customCheck: () => can('supervisor.workspace.view') && can('attendance.record') },
            { path: '/supervisor/assessments', label: locale === 'ar' ? 'تقييمات الطلبة' : 'Student Assessments', icon: ClipboardCheck, customCheck: () => can('supervisor.workspace.view') && can('assessment.create') },
            { path: '/advising', label: locale === 'ar' ? 'الإرشاد الأكاديمي' : 'Academic Advising', icon: GraduationCap, permission: 'advising.view' },
          ]
        },
        {
          title: locale === 'ar' ? 'الملف الشخصي والمراسلات' : 'Profile & Messages',
          items: [
            { path: '/profile', label: locale === 'ar' ? 'ملفي الشخصي' : 'My Profile', icon: UserRound },
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
          { path: '/supervisor/portal', label: locale === 'ar' ? 'لوحة المشرف السريري' : 'Clinical Supervisor Workspace', icon: LayoutDashboard, customCheck: () => isClinicalSupervisor && can('supervisor.workspace.view') },
          { path: '/attendance', label: locale === 'ar' ? 'سجل الحضور والغياب' : 'Attendance Log', icon: Clock, permission: 'attendance.review' },
          { path: '/assessments', label: locale === 'ar' ? 'مراجعة التقييمات السريرية' : 'Clinical Assessment Review', icon: ClipboardCheck, permission: 'assessment.review' },
          { path: '/assessments/criteria', label: locale === 'ar' ? 'إعداد نموذج التقييم' : 'Assessment Template', icon: Settings, permission: 'assessment.criteria.manage' },
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
          { path: '/approvals', label: locale === 'ar' ? 'مركز الاعتمادات' : 'Approval Center', icon: GitBranch, permission: 'approvals.view' },
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
          { path: '/admin/approval-workflows', label: locale === 'ar' ? 'إعداد مسارات الاعتماد' : 'Approval Workflows', icon: GitBranch, permission: 'approval_workflows.view' },
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
        className={`fixed inset-y-0 z-40 flex max-w-[90vw] flex-col border-e border-slate-200 bg-white transition-all duration-200 ease-in-out md:sticky md:top-0 md:h-screen md:translate-x-0 ${isCollapsed ? 'md:w-20' : 'md:w-80'} w-80 ${
          isOpenMobile
            ? 'translate-x-0 shadow-2xl'
            : locale === 'ar' ? 'translate-x-full md:translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="flex h-18 shrink-0 items-center justify-between border-b border-slate-100 px-4">
          <NavLink to="/" onClick={onCloseMobile} className="flex min-w-0 items-center gap-2.5">
            <img src={hebronLogo} alt="" className="h-10 w-10 shrink-0 object-contain" />
            {!isCollapsed && <span className="min-w-0"><strong className="block truncate text-sm font-black text-slate-900">{locale === 'ar' ? 'جامعة الخليل' : 'Hebron University'}</strong><span className="mt-0.5 block truncate text-[11px] font-bold text-teal-700">{locale === 'ar' ? 'إدارة الدائرة السريرية' : 'Clinical Department'}</span></span>}
          </NavLink>
          <button onClick={onCloseMobile} aria-label={locale === 'ar' ? 'إغلاق القائمة' : 'Close navigation'} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 md:hidden">
            <X className="h-5 w-5" />
          </button>
          <button onClick={onToggleCollapsed} className="hidden rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-teal-700 md:block" title={isCollapsed ? (locale === 'ar' ? 'توسيع القائمة' : 'Expand navigation') : (locale === 'ar' ? 'تصغير القائمة' : 'Collapse navigation')}>
            {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>

        <div className={`flex-1 overflow-y-auto py-3 ${isCollapsed ? 'md:px-2' : 'px-3'}`}>
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

            const isClosed = closedSections.has(idx);
            return (
              <div key={idx} className="mb-3">
                {!isCollapsed && <button type="button" onClick={() => setClosedSections(current => { const next = new Set(current); next.has(idx) ? next.delete(idx) : next.add(idx); return next; })} className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-[11px] font-black text-slate-500 hover:bg-slate-50 hover:text-slate-700">
                  <span>{section.title}</span><ChevronDown className={`h-4 w-4 transition ${isClosed ? '' : 'rotate-180'}`} />
                </button>}
                {(!isClosed || isCollapsed) && <div className="mt-1 space-y-0.5">
                  {filteredItems.map(item => {
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        onClick={onCloseMobile}
                        title={isCollapsed ? item.label : undefined}
                        className={({ isActive }) =>
                          `relative flex h-11 items-center rounded-xl text-sm font-bold transition-colors ${isCollapsed ? 'md:justify-center md:px-0 px-3 gap-3' : 'gap-3.5 px-3'} ${
                            isActive
                              ? 'bg-teal-50 text-teal-800'
                              : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                          }`
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {isActive && <span className="absolute inset-y-2 right-0 w-0.5 rounded-full bg-teal-600 rtl:right-0 ltr:right-auto ltr:left-0" />}
                            <Icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-teal-800' : 'text-teal-600'}`} />
                            <span className={`truncate ${isCollapsed ? 'md:hidden' : ''}`}>{item.label}</span>
                          </>
                        )}
                      </NavLink>
                    );
                  })}
                </div>}
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}
