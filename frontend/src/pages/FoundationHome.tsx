import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowLeft,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileText,
  GitBranch,
  GraduationCap,
  HeartPulse,
  Inbox,
  ListChecks,
  Mail,
  Map,
  Monitor,
  RefreshCw,
  ServerCog,
  Settings,
  ShieldCheck,
  Stethoscope,
  Users,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiFetch } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { useI18n } from "@/i18n/I18nContext";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";

type Metric = {
  key: string;
  label_ar: string;
  label_en: string;
  value: number;
  unit: string | null;
  route: string;
};
type AttentionItem = {
  key: string;
  label_ar: string;
  label_en: string;
  count: number;
  route: string;
  severity: "notice" | "review" | "urgent";
};
type ActivityItem = {
  key: string;
  type: "task" | "correspondence" | "audit";
  title: string;
  subtitle_ar: string;
  subtitle_en: string;
  at: string;
  route: string;
};
type DashboardOverview = {
  profile: {
    name: string;
    focus: string;
    roles: string[];
    assigned_levels: string[];
    scope_student_count: number;
  };
  metrics: Metric[];
  attention: AttentionItem[];
  activity: ActivityItem[];
  generated_at: string;
};
type Action = {
  route: string;
  labelAr: string;
  labelEn: string;
  descriptionAr: string;
  descriptionEn: string;
  icon: LucideIcon;
  permission?: string;
  roles?: string[];
};

const roleLabels: Record<string, { ar: string; en: string }> = {
  SYS_ADMIN: { ar: "مدير النظام", en: "System Administrator" },
  CLINICAL_DIRECTOR: {
    ar: "مدير الدائرة السريرية",
    en: "Clinical Department Director",
  },
  DEPARTMENT_HEAD: {
    ar: "رئيس القسم الأكاديمي",
    en: "Academic Department Head",
  },
  DEAN: { ar: "عميد الكلية", en: "Faculty Dean" },
  VICE_DEAN: { ar: "نائب العميد", en: "Vice Dean" },
  RTA: { ar: "مساعد بحث وتدريس", en: "Research and Teaching Assistant" },
  ACADEMIC_ADVISOR: { ar: "مرشد أكاديمي", en: "Academic Advisor" },
  QUALITY: { ar: "مسؤول الجودة", en: "Quality Officer" },
  ADMIN_ASSISTANT: { ar: "مساعد إداري", en: "Administrative Assistant" },
  CLINICAL_SUPERVISOR: { ar: "مشرف سريري", en: "Clinical Supervisor" },
};
const focusCopy: Record<string, { ar: string; en: string }> = {
  system: { ar: "متابعة النظام والتشغيل", en: "System and operations" },
  clinical_leadership: { ar: "إدارة العمل السريري", en: "Clinical operations" },
  faculty_leadership: { ar: "متابعة أعمال الكلية", en: "Faculty oversight" },
  department: { ar: "متابعة القسم الأكاديمي", en: "Academic department" },
  cohort: { ar: "متابعة الدفعة المكلف بها", en: "Assigned cohort" },
  advising: { ar: "متابعة الإرشاد الأكاديمي", en: "Academic advising" },
  quality: { ar: "الجودة والتحسين", en: "Quality improvement" },
  operations: { ar: "الأعمال الإدارية اليومية", en: "Daily administration" },
  general: { ar: "مساحة العمل اليومية", en: "Daily workspace" },
};
const metricIcons: Record<string, LucideIcon> = {
  students_total: Users,
  students_registered: GraduationCap,
  attendance_rate: CheckCircle2,
  attendance_absent: Clock3,
  grades_completion: BookOpen,
  assessments_total: ClipboardCheck,
  published_placements: Stethoscope,
  distribution_coverage: Map,
  active_courses: BookOpen,
  registration_cycles: GraduationCap,
  my_open_tasks: ListChecks,
  correspondence_active: Mail,
  upcoming_meetings: CalendarDays,
  quality_surveys: Activity,
  quality_kpis: ShieldCheck,
  advising_records: HeartPulse,
  system_users: Users,
  system_sessions: Monitor,
  audit_events: FileText,
  approval_queue: GitBranch,
};
const actions: Action[] = [
  {
    route: "/approvals",
    labelAr: "مركز الاعتمادات",
    labelEn: "Approval center",
    descriptionAr: "راجع الطلبات واتخذ القرار",
    descriptionEn: "Review and decide requests",
    icon: GitBranch,
    permission: "approvals.view",
    roles: ["CLINICAL_DIRECTOR", "DEAN", "VICE_DEAN"],
  },
  {
    route: "/distribution",
    labelAr: "التوزيع السريري",
    labelEn: "Clinical distribution",
    descriptionAr: "إعداد ومراجعة جداول التوزيع",
    descriptionEn: "Prepare and review distributions",
    icon: Map,
    permission: "distribution.view",
  },
  {
    route: "/clinical/schedule",
    labelAr: "الجدول السريري",
    labelEn: "Clinical schedule",
    descriptionAr: "عرض البرنامج السريري المنشور",
    descriptionEn: "View the published clinical plan",
    icon: CalendarDays,
    permission: "clinical_schedule.view",
  },
  {
    route: "/attendance",
    labelAr: "الحضور والغياب",
    labelEn: "Attendance",
    descriptionAr: "متابعة المجموعات وتنبيهات الغياب",
    descriptionEn: "Review groups and absence alerts",
    icon: Clock3,
    permission: "attendance.review",
  },
  {
    route: "/grades",
    labelAr: "العلامات",
    labelEn: "Grades",
    descriptionAr: "استكمال ومراجعة واعتماد الكشوف",
    descriptionEn: "Complete and approve grade sheets",
    icon: BookOpen,
    permission: "grades.view",
  },
  {
    route: "/distribution/groups",
    labelAr: "مجموعات الطلبة",
    labelEn: "Student groups",
    descriptionAr: "إدارة دورات التسجيل والمجموعات",
    descriptionEn: "Manage registration cycles and groups",
    icon: GraduationCap,
    permission: "group_registration.view",
  },
  {
    route: "/directory",
    labelAr: "دليل الطلبة",
    labelEn: "Student directory",
    descriptionAr: "الوصول لملفات وبيانات الطلبة",
    descriptionEn: "Open student records and profiles",
    icon: Users,
    permission: "students.view",
  },
  {
    route: "/clinical-supervisors",
    labelAr: "المشرفون والمستشفيات",
    labelEn: "Supervisors and hospitals",
    descriptionAr: "إدارة المشرفين وأيام عملهم",
    descriptionEn: "Manage supervisors and work days",
    icon: Stethoscope,
    permission: "people.view",
  },
  {
    route: "/assessments",
    labelAr: "التقييمات السريرية",
    labelEn: "Clinical assessments",
    descriptionAr: "مراجعة تقييمات الطلبة الأسبوعية",
    descriptionEn: "Review weekly student assessments",
    icon: ClipboardCheck,
    permission: "assessment.review",
  },
  {
    route: "/advising",
    labelAr: "الإرشاد الأكاديمي",
    labelEn: "Academic advising",
    descriptionAr: "متابعة الطلبة والحالات المفتوحة",
    descriptionEn: "Follow students and open cases",
    icon: HeartPulse,
    permission: "advising.view",
  },
  {
    route: "/quality",
    labelAr: "الجودة والتحسين",
    labelEn: "Quality improvement",
    descriptionAr: "متابعة المؤشرات وخطط التحسين",
    descriptionEn: "Track indicators and improvement plans",
    icon: Activity,
    permission: "quality.view",
  },
  {
    route: "/inbox",
    labelAr: "المراسلات",
    labelEn: "Mail",
    descriptionAr: "قراءة وإرسال البريد الداخلي",
    descriptionEn: "Read and send internal mail",
    icon: Inbox,
    permission: "correspondence.view",
  },
  {
    route: "/tasks",
    labelAr: "المهام",
    labelEn: "Tasks",
    descriptionAr: "متابعة التكليفات ومواعيدها",
    descriptionEn: "Track assignments and deadlines",
    icon: ListChecks,
    permission: "tasks.view",
  },
  {
    route: "/meetings",
    labelAr: "الاجتماعات",
    labelEn: "Meetings",
    descriptionAr: "إدارة الاجتماعات والمحاضر",
    descriptionEn: "Manage meetings and minutes",
    icon: CalendarDays,
    permission: "meetings.manage",
  },
  {
    route: "/operational/reports",
    labelAr: "التقارير",
    labelEn: "Reports",
    descriptionAr: "تقارير التشغيل والبيانات",
    descriptionEn: "Operational reports and data",
    icon: FileText,
    permission: "reports.view",
  },
  {
    route: "/courses",
    labelAr: "المساقات السريرية",
    labelEn: "Clinical courses",
    descriptionAr: "إدارة المساقات ومكوناتها",
    descriptionEn: "Manage courses and components",
    icon: BookOpen,
    permission: "courses.view",
  },
  {
    route: "/users",
    labelAr: "المستخدمون",
    labelEn: "Users",
    descriptionAr: "إدارة الحسابات والأدوار",
    descriptionEn: "Manage accounts and roles",
    icon: Users,
    permission: "users.manage",
    roles: ["SYS_ADMIN"],
  },
  {
    route: "/admin/permissions",
    labelAr: "الصلاحيات",
    labelEn: "Permissions",
    descriptionAr: "ضبط صلاحيات الأدوار والشاشات",
    descriptionEn: "Configure role and screen access",
    icon: ShieldCheck,
    permission: "roles.manage",
    roles: ["SYS_ADMIN"],
  },
  {
    route: "/admin/health",
    labelAr: "صحة النظام",
    labelEn: "System health",
    descriptionAr: "فحص الخدمات والمهام الخلفية",
    descriptionEn: "Check services and background jobs",
    icon: ServerCog,
    permission: "settings.manage",
    roles: ["SYS_ADMIN"],
  },
  {
    route: "/admin/settings",
    labelAr: "إعدادات النظام",
    labelEn: "System settings",
    descriptionAr: "الإعدادات والنسخ الاحتياطي",
    descriptionEn: "Settings and backup",
    icon: Settings,
    permission: "settings.manage",
    roles: ["SYS_ADMIN"],
  },
  {
    route: "/audit-logs",
    labelAr: "سجل العمليات",
    labelEn: "Audit log",
    descriptionAr: "مراجعة العمليات الحساسة في النظام",
    descriptionEn: "Review sensitive system actions",
    icon: FileText,
    permission: "audit.view",
    roles: ["SYS_ADMIN"],
  },
];
const roleActionOrder: Record<string, string[]> = {
  SYS_ADMIN: [
    "/admin/health",
    "/users",
    "/admin/permissions",
    "/admin/settings",
    "/audit-logs",
    "/inbox",
  ],
  CLINICAL_DIRECTOR: [
    "/approvals",
    "/distribution",
    "/clinical/schedule",
    "/attendance",
    "/grades",
    "/clinical-supervisors",
  ],
  DEAN: [
    "/approvals",
    "/grades",
    "/operational/reports",
    "/quality",
    "/meetings",
    "/inbox",
  ],
  RTA: [
    "/distribution/groups",
    "/distribution",
    "/grades",
    "/attendance",
    "/directory",
    "/inbox",
  ],
  ADMIN_ASSISTANT: [
    "/directory",
    "/clinical-supervisors",
    "/distribution/groups",
    "/courses",
    "/meetings",
    "/inbox",
  ],
  DEPARTMENT_HEAD: [
    "/clinical/schedule",
    "/attendance",
    "/assessments",
    "/grades",
    "/directory",
    "/inbox",
  ],
  QUALITY: [
    "/quality",
    "/operational/reports",
    "/tasks",
    "/meetings",
    "/inbox",
  ],
  ACADEMIC_ADVISOR: ["/advising", "/directory", "/tasks", "/inbox"],
};

function localizedDate(value: string, locale: string, withTime = false) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(locale === "ar" ? "ar-PS" : "en-GB", {
        year: "numeric",
        month: "short",
        day: "numeric",
        ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
      }).format(date);
}

export function FoundationHome() {
  const { user, can, hasRole } = useAuth();
  const { locale } = useI18n();
  const ar = locale === "ar";
  const tr = (arabic: string, english: string) => (ar ? arabic : english);
  const dashboardQuery = useQuery({
    queryKey: ["role-dashboard-overview", user?.id],
    queryFn: () => apiFetch<DashboardOverview>("/dashboard/overview"),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  if (dashboardQuery.isLoading) return <LoadingState />;
  if (dashboardQuery.isError || !dashboardQuery.data)
    return (
      <ErrorState
        title={tr("تعذر تحميل لوحة التحكم", "Could not load dashboard")}
        onRetry={() => dashboardQuery.refetch()}
      />
    );
  const dashboard = dashboardQuery.data;
  const primaryRole =
    dashboard.profile.roles.find((role) => role !== "CLINICAL_SUPERVISOR") ||
    dashboard.profile.roles[0];
  const role = roleLabels[primaryRole];
  const focus = focusCopy[dashboard.profile.focus] || focusCopy.general;
  const permitted = actions.filter(
    (action) =>
      (!action.permission || can(action.permission)) &&
      (!action.roles || action.roles.some((item) => hasRole(item))),
  );
  const preferred = roleActionOrder[primaryRole] || [];
  const quickActions = [...permitted]
    .sort((a, b) => {
      const ai = preferred.indexOf(a.route);
      const bi = preferred.indexOf(b.route);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    })
    .slice(0, 6);
  const topMetrics = dashboard.metrics
    .filter((metric) =>
      [
        "approval_queue",
        "my_open_tasks",
        "correspondence_active",
        "attendance_rate",
        "grades_completion",
        "students_total",
        "system_sessions",
        "system_users",
        "quality_kpis",
        "advising_records",
      ].includes(metric.key),
    )
    .slice(0, 4);
  const attentionCount = dashboard.attention.reduce(
    (sum, item) => sum + item.count,
    0,
  );
  const today = new Intl.DateTimeFormat(ar ? "ar-PS" : "en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());
  return (
    <main
      aria-label={tr("مساحة العمل اليومية", "Daily workspace")}
      className="mx-auto max-w-[1380px] space-y-4 pb-10 sm:space-y-5"
    >
      <header className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white px-5 py-5 shadow-sm sm:px-7 sm:py-6">
        <div className="absolute inset-y-0 start-0 w-1 bg-teal-600" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-bold text-teal-700">
              <span className="rounded-full bg-teal-50 px-2.5 py-1">
                {ar ? focus.ar : focus.en}
              </span>
              {role && (
                <span className="text-slate-500">{ar ? role.ar : role.en}</span>
              )}
            </div>
            <h1 className="truncate text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
              {tr("مرحباً،", "Welcome,")} {dashboard.profile.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span>{today}</span>
              {dashboard.profile.assigned_levels.length > 0 && (
                <span>
                  {tr("نطاق الدفعات: ", "Cohorts: ")}
                  {dashboard.profile.assigned_levels.join("، ")}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => dashboardQuery.refetch()}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 shadow-sm transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 sm:self-auto"
          >
            <RefreshCw
              className={`h-4 w-4 ${dashboardQuery.isFetching ? "animate-spin" : ""}`}
            />
            {tr("تحديث البيانات", "Refresh")}
          </button>
        </div>
      </header>

      {topMetrics.length > 0 && (
        <section
          aria-label={tr("ملخص الأداء", "Performance summary")}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          {topMetrics.map((metric) => {
            const Icon = metricIcons[metric.key] || Activity;
            return (
              <Link
                key={metric.key}
                to={metric.route}
                className="group flex min-h-24 items-center gap-4 rounded-2xl border border-slate-200/80 bg-white px-5 py-4 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700 transition group-hover:bg-teal-600 group-hover:text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <strong className="block text-2xl font-black tabular-nums text-slate-950">
                    {metric.value.toLocaleString(ar ? "ar-PS" : "en-GB")}
                    <small className="ms-1 text-xs font-bold text-teal-700">
                      {metric.unit}
                    </small>
                  </strong>
                  <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500">
                    {ar ? metric.label_ar : metric.label_en}
                  </p>
                </div>
              </Link>
            );
          })}
        </section>
      )}

      <nav
        aria-label={tr("الوصول السريع", "Quick access")}
        className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5"
      >
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-slate-900">
              {tr("الوصول السريع", "Quick access")}
            </h2>
            <p className="mt-1 text-[11px] text-slate-500">
              {tr(
                "اختصارات مناسبة لدورك وصلاحياتك",
                "Shortcuts tailored to your role and permissions",
              )}
            </p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.route}
                to={action.route}
                className="group flex min-h-16 items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-3 transition hover:border-teal-200 hover:bg-teal-50/70"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-teal-700 shadow-sm">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-black text-slate-800">
                    {ar ? action.labelAr : action.labelEn}
                  </p>
                  <p className="mt-1 truncate text-[10px] text-slate-500">
                    {ar ? action.descriptionAr : action.descriptionEn}
                  </p>
                </div>
                <ArrowLeft className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-teal-600 rtl:rotate-180" />
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)]">
        <section
          aria-labelledby="dashboard-attention-title"
          className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2
                id="dashboard-attention-title"
                className="text-sm font-black text-slate-900"
              >
                {tr("ما يحتاج متابعتك", "Needs your attention")}
              </h2>
              <p className="mt-1 text-[10px] text-slate-500">
                {tr(
                  "الأعمال ذات الأولوية ضمن نطاقك",
                  "Priority work within your scope",
                )}
              </p>
            </div>
            <span
              className={`grid h-8 min-w-8 place-items-center rounded-full px-2 text-xs font-black ${attentionCount ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}
            >
              {attentionCount}
            </span>
          </div>
          {dashboard.attention.length ? (
            <div className="divide-y divide-slate-100">
              {dashboard.attention.slice(0, 6).map((item) => (
                <Link
                  key={item.key}
                  to={item.route}
                  className="group flex items-center gap-3 px-5 py-3.5 transition hover:bg-slate-50"
                >
                  <span
                    className={`grid h-8 min-w-8 place-items-center rounded-lg px-2 text-xs font-black ${item.severity === "urgent" ? "bg-red-50 text-red-700" : item.severity === "review" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}
                  >
                    {item.count}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-xs font-bold text-slate-700">
                    {ar ? item.label_ar : item.label_en}
                  </p>
                  <ArrowLeft className="h-4 w-4 text-slate-300 group-hover:text-teal-600 rtl:rotate-180" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 px-5 py-6">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-50">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </span>
              <div>
                <p className="text-xs font-black text-slate-700">
                  {tr(
                    "لا توجد إجراءات معلقة حالياً",
                    "Nothing is waiting for you",
                  )}
                </p>
                <p className="mt-1 text-[10px] text-slate-400">
                  {tr(
                    "جميع الأعمال ضمن نطاقك محدثة",
                    "Everything in your scope is up to date",
                  )}
                </p>
              </div>
            </div>
          )}
        </section>

        <section
          aria-labelledby="dashboard-scope-title"
          className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm"
        >
          <div className="border-b border-slate-100 px-5 py-4">
            <h2
              id="dashboard-scope-title"
              className="text-sm font-black text-slate-900"
            >
              {tr("نطاق العمل", "Work scope")}
            </h2>
          </div>
          <div className="grid grid-cols-2 divide-x divide-slate-100 rtl:divide-x-reverse">
            <div className="px-5 py-5">
              <strong className="block text-xl font-black text-slate-900">
                {dashboard.profile.scope_student_count.toLocaleString(
                  ar ? "ar-PS" : "en-GB",
                )}
              </strong>
              <span className="mt-1 block text-[10px] text-slate-500">
                {tr("الطلبة ضمن نطاقك", "Students in scope")}
              </span>
            </div>
            <div className="px-5 py-5">
              <strong className="block text-xl font-black text-slate-900">
                {permitted.length.toLocaleString(ar ? "ar-PS" : "en-GB")}
              </strong>
              <span className="mt-1 block text-[10px] text-slate-500">
                {tr("مساحات العمل المتاحة", "Available work areas")}
              </span>
            </div>
          </div>
        </section>
      </div>

      <section
        aria-labelledby="dashboard-activity-title"
        className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          <Clock3 className="h-4 w-4 text-teal-600" />
          <h2
            id="dashboard-activity-title"
            className="text-sm font-black text-slate-900"
          >
            {tr("آخر التحديثات", "Recent updates")}
          </h2>
        </div>
        {dashboard.activity.length ? (
          <div className="grid divide-y divide-slate-100 lg:grid-cols-2 lg:divide-y-0">
            {dashboard.activity.slice(0, 6).map((item, index) => (
              <Link
                key={item.key}
                to={item.route}
                className={`flex items-center gap-3 px-5 py-3.5 transition hover:bg-slate-50 ${index > 1 ? "lg:border-t lg:border-slate-100" : ""} ${index % 2 ? "lg:border-s lg:border-slate-100" : ""}`}
              >
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${item.type === "correspondence" ? "bg-blue-50 text-blue-700" : item.type === "task" ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-600"}`}
                >
                  {item.type === "correspondence" ? (
                    <Mail className="h-3.5 w-3.5" />
                  ) : item.type === "task" ? (
                    <ListChecks className="h-3.5 w-3.5" />
                  ) : (
                    <ShieldCheck className="h-3.5 w-3.5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-slate-700">
                    {item.title}
                  </p>
                  <p className="mt-1 truncate text-[9px] text-slate-400">
                    {ar ? item.subtitle_ar : item.subtitle_en}
                  </p>
                </div>
                <time className="shrink-0 text-[9px] text-slate-400">
                  {localizedDate(item.at, locale)}
                </time>
              </Link>
            ))}
          </div>
        ) : (
          <p className="px-5 py-6 text-center text-xs text-slate-400">
            {tr(
              "لا توجد تحديثات حديثة ضمن نطاقك",
              "No recent updates in your scope",
            )}
          </p>
        )}
      </section>
      <p className="text-center text-[9px] text-slate-400">
        {tr("آخر تحديث: ", "Last updated: ")}
        {localizedDate(dashboard.generated_at, locale, true)}
      </p>
    </main>
  );
}
