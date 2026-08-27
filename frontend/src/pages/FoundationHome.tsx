import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ExcelJS from 'exceljs';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  BarChart3,
  BellRing,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Download,
  FileText,
  GraduationCap,
  HeartPulse,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Loader2,
  Mail,
  Printer,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  Stethoscope,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';

type Metric = {
  key: string;
  label_ar: string;
  label_en: string;
  value: number;
  unit: string | null;
  route: string;
};

type ChartItem = {
  label_ar: string;
  label_en: string;
  value: number;
};

type Chart = {
  key: string;
  type: 'bar' | 'donut' | 'line';
  title_ar: string;
  title_en: string;
  items: ChartItem[];
};

type AttentionItem = {
  key: string;
  label_ar: string;
  label_en: string;
  count: number;
  route: string;
  severity: 'notice' | 'review' | 'urgent';
};

type ActivityItem = {
  key: string;
  type: 'task' | 'correspondence' | 'audit';
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
  charts: Chart[];
  attention: AttentionItem[];
  activity: ActivityItem[];
  generated_at: string;
};

const ROLE_LABELS: Record<string, { ar: string; en: string }> = {
  SYS_ADMIN: { ar: 'مدير النظام', en: 'System Administrator' },
  CLINICAL_DIRECTOR: { ar: 'مدير الدائرة السريرية', en: 'Clinical Department Director' },
  DEPARTMENT_HEAD: { ar: 'رئيس القسم الأكاديمي', en: 'Academic Department Head' },
  CLINICAL_SUPERVISOR: { ar: 'مشرف سريري', en: 'Clinical Supervisor' },
  DEAN: { ar: 'عميد الكلية', en: 'Faculty Dean' },
  VICE_DEAN: { ar: 'نائب العميد', en: 'Vice Dean' },
  RTA: { ar: 'مساعد بحث وتدريس', en: 'Research and Teaching Assistant' },
  ACADEMIC_ADVISOR: { ar: 'مرشد أكاديمي', en: 'Academic Advisor' },
  QUALITY: { ar: 'مسؤول الجودة', en: 'Quality Officer' },
  ADMIN_ASSISTANT: { ar: 'مساعد إداري', en: 'Administrative Assistant' },
};

const FOCUS_COPY: Record<string, { titleAr: string; titleEn: string; descriptionAr: string; descriptionEn: string }> = {
  system: {
    titleAr: 'الرقابة الفنية والتشغيلية',
    titleEn: 'Technical and operational oversight',
    descriptionAr: 'صحة النظام، الحسابات، الجلسات، وسجل العمليات إلى جانب المؤشرات المسموحة.',
    descriptionEn: 'System health, accounts, sessions, audit activity, and authorized operational metrics.',
  },
  clinical_leadership: {
    titleAr: 'قيادة التشغيل السريري',
    titleEn: 'Clinical operations leadership',
    descriptionAr: 'مؤشرات شاملة للتوزيع والحضور والتقييمات والقرارات التي تحتاج متابعة.',
    descriptionEn: 'A complete view of distribution, attendance, assessments, and decisions requiring follow-up.',
  },
  faculty_leadership: {
    titleAr: 'المتابعة الأكاديمية للكلية',
    titleEn: 'Faculty academic oversight',
    descriptionAr: 'مقارنات أكاديمية وسريرية لدعم المتابعة والاعتماد واتخاذ القرار.',
    descriptionEn: 'Academic and clinical comparisons supporting oversight, approval, and decisions.',
  },
  department: {
    titleAr: 'أداء القسم والدفعات',
    titleEn: 'Department and cohort performance',
    descriptionAr: 'تعرض اللوحة الطلبة والعمليات الواقعة ضمن نطاق القسم المكلف به فقط.',
    descriptionEn: 'The dashboard only includes students and operations within your assigned department scope.',
  },
  cohort: {
    titleAr: 'متابعة الدفعة المكلف بها',
    titleEn: 'Assigned cohort follow-up',
    descriptionAr: 'الطلبة والحضور والعلامات والتوزيع والمهام الخاصة بالدفعة المكلف بها فقط.',
    descriptionEn: 'Students, attendance, grades, distribution, and tasks for your assigned cohort only.',
  },
  supervisor: {
    titleAr: 'مساحة الإشراف السريري',
    titleEn: 'Clinical supervision workspace',
    descriptionAr: 'مؤشرات الطلبة والتقييمات والحضور والمهام المرتبطة بتعييناتك المنشورة.',
    descriptionEn: 'Student, assessment, attendance, and task metrics linked to your published assignments.',
  },
  advising: {
    titleAr: 'متابعة الإرشاد الأكاديمي',
    titleEn: 'Academic advising follow-up',
    descriptionAr: 'ملخص الطلبة المسندين وحالات الإرشاد والتنبيهات التي تحتاج تدخلاً.',
    descriptionEn: 'Assigned students, advising cases, and alerts requiring intervention.',
  },
  quality: {
    titleAr: 'الجودة والتحسين المستمر',
    titleEn: 'Quality and continuous improvement',
    descriptionAr: 'الاستبيانات ومؤشرات الجودة وخطط التحسين المفتوحة في لوحة موحدة.',
    descriptionEn: 'Surveys, quality indicators, and open improvement plans in one dashboard.',
  },
  operations: {
    titleAr: 'متابعة الأعمال الإدارية',
    titleEn: 'Administrative operations',
    descriptionAr: 'المجموعات والطلبة والمراسلات والاجتماعات والمهام ضمن صلاحيات الحساب.',
    descriptionEn: 'Groups, students, correspondence, meetings, and tasks within account permissions.',
  },
  general: {
    titleAr: 'ملخص العمل اليومي',
    titleEn: 'Daily work summary',
    descriptionAr: 'محتوى شخصي مبني على أدوارك وصلاحياتك الحالية.',
    descriptionEn: 'A personal view based on your current roles and permissions.',
  },
};

const metricIcons: Record<string, LucideIcon> = {
  students_total: Users,
  students_registered: GraduationCap,
  attendance_rate: CheckCircle2,
  attendance_absent: BellRing,
  grades_completion: BookOpen,
  assessments_total: ClipboardCheck,
  published_placements: Stethoscope,
  distribution_coverage: Activity,
  active_courses: BookOpen,
  registration_cycles: GraduationCap,
  my_open_tasks: ListChecks,
  correspondence_active: Mail,
  upcoming_meetings: CalendarDays,
  quality_surveys: BarChart3,
  quality_kpis: ShieldCheck,
  advising_records: HeartPulse,
  system_users: Users,
  system_sessions: ServerCog,
  audit_events: FileText,
};

const chartColors = ['#0d9488', '#2dd4bf', '#99f6e4', '#cbd5e1', '#94a3b8', '#5eead4'];

function localizedDate(value: string, locale: string, withTime = false): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-PS' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

function dataUrlFromBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function FoundationHome() {
  const { user, can, hasRole } = useAuth();
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const tr = (arabic: string, english: string) => (ar ? arabic : english);
  const [exporting, setExporting] = useState(false);

  const dashboardQuery = useQuery({
    queryKey: ['role-dashboard-overview', user?.id],
    queryFn: () => apiFetch<DashboardOverview>('/dashboard/overview'),
  });

  if (dashboardQuery.isLoading) return <LoadingState />;
  if (dashboardQuery.isError || !dashboardQuery.data) {
    return <ErrorState title={tr('تعذر تحميل لوحة التحكم', 'Could not load dashboard')} onRetry={() => dashboardQuery.refetch()} />;
  }

  const dashboard = dashboardQuery.data;
  const focus = FOCUS_COPY[dashboard.profile.focus] ?? FOCUS_COPY.general;
  const displayedMetrics = dashboard.metrics;
  const displayedCharts = dashboard.charts.filter((chart) => chart.items.length > 0);

  const exportDashboard = async () => {
    setExporting(true);
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Hebron University - Clinical Department';
      workbook.created = new Date();
      const summary = workbook.addWorksheet(ar ? 'ملخص لوحة التحكم' : 'Dashboard Summary', {
        views: [{ rightToLeft: ar }],
      });

      summary.columns = [
        { width: 28 },
        { width: 24 },
        { width: 22 },
        { width: 22 },
        { width: 22 },
        { width: 22 },
      ];
      summary.mergeCells('B1:F1');
      summary.getCell('B1').value = tr('جامعة الخليل | كلية الطب | الدائرة السريرية', 'Hebron University | Faculty of Medicine | Clinical Department');
      summary.getCell('B1').font = { bold: true, size: 16, color: { argb: 'FF0F766E' } };
      summary.getCell('B1').alignment = { horizontal: ar ? 'right' : 'left', vertical: 'middle' };
      summary.mergeCells('B2:F2');
      summary.getCell('B2').value = tr('تقرير إحصائيات لوحة التحكم', 'Dashboard Statistics Report');
      summary.getCell('B2').font = { bold: true, size: 13 };
      summary.mergeCells('B3:F3');
      summary.getCell('B3').value = `${dashboard.profile.name} · ${localizedDate(dashboard.generated_at, locale, true)}`;
      summary.getCell('B3').font = { size: 10, color: { argb: 'FF64748B' } };

      try {
        const logoResponse = await fetch('/assets/hebron-BZfyxO91.png');
        if (logoResponse.ok) {
          const logo = await dataUrlFromBlob(await logoResponse.blob());
          const imageId = workbook.addImage({ base64: logo, extension: 'png' });
          summary.addImage(imageId, { tl: { col: 0.15, row: 0.15 }, ext: { width: 58, height: 58 } });
        }
      } catch {
        // Branding text remains complete if the optional logo cannot be loaded.
      }

      summary.addRow([]);
      const metricHeader = summary.addRow([tr('المؤشر', 'Metric'), tr('القيمة', 'Value'), tr('الوحدة', 'Unit')]);
      metricHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      metricHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
      displayedMetrics.forEach((metric) => summary.addRow([
        ar ? metric.label_ar : metric.label_en,
        metric.value,
        metric.unit ?? '',
      ]));

      const comparisons = workbook.addWorksheet(ar ? 'المقارنات والرسوم' : 'Comparisons', {
        views: [{ rightToLeft: ar }],
      });
      comparisons.columns = [{ width: 32 }, { width: 32 }, { width: 18 }];
      const comparisonHeader = comparisons.addRow([
        tr('المقارنة', 'Comparison'),
        tr('الفئة', 'Category'),
        tr('القيمة', 'Value'),
      ]);
      comparisonHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      comparisonHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
      dashboard.charts.forEach((chart) => {
        chart.items.forEach((item) => comparisons.addRow([
          ar ? chart.title_ar : chart.title_en,
          ar ? item.label_ar : item.label_en,
          item.value,
        ]));
      });

      const followUp = workbook.addWorksheet(ar ? 'المتابعة المطلوبة' : 'Attention Required', {
        views: [{ rightToLeft: ar }],
      });
      followUp.columns = [{ width: 42 }, { width: 16 }, { width: 18 }];
      const followHeader = followUp.addRow([tr('البند', 'Item'), tr('العدد', 'Count'), tr('المستوى', 'Severity')]);
      followHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      followHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
      dashboard.attention.forEach((item) => followUp.addRow([
        ar ? item.label_ar : item.label_en,
        item.count,
        item.severity,
      ]));

      [summary, comparisons, followUp].forEach((sheet) => {
        sheet.eachRow((row) => {
          row.alignment = { vertical: 'middle', horizontal: ar ? 'right' : 'left' };
          row.height = Math.max(row.height ?? 15, 20);
        });
        sheet.autoFilter = sheet.rowCount > 5 ? { from: 'A5', to: `C${sheet.rowCount}` } : undefined;
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `CDMS-Dashboard-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const quickActions = [
    can('students.view') && { route: '/directory', labelAr: 'دليل الطلبة', labelEn: 'Student directory', icon: Users },
    can('clinical_schedule.view') && { route: '/clinical/schedule', labelAr: 'الجدول السريري', labelEn: 'Clinical schedule', icon: CalendarDays },
    can('attendance.view') && { route: '/attendance', labelAr: 'الحضور والغياب', labelEn: 'Attendance', icon: CheckCircle2 },
    can('grades.view') && { route: '/grades', labelAr: 'العلامات', labelEn: 'Grades', icon: BookOpen },
    can('assessment.view') && { route: hasRole('CLINICAL_SUPERVISOR') ? '/supervisor/portal' : '/assessments', labelAr: 'التقييمات', labelEn: 'Assessments', icon: ClipboardCheck },
    can('tasks.view') && { route: '/tasks', labelAr: 'المهام', labelEn: 'Tasks', icon: ListChecks },
    can('correspondence.view') && { route: '/inbox', labelAr: 'المراسلات', labelEn: 'Correspondence', icon: Inbox },
    can('reports.view') && { route: '/operational/reports', labelAr: 'مركز التقارير', labelEn: 'Report center', icon: BarChart3 },
    can('users.manage') && { route: '/users', labelAr: 'المستخدمون', labelEn: 'Users', icon: ServerCog },
  ].filter(Boolean) as Array<{ route: string; labelAr: string; labelEn: string; icon: LucideIcon }>;

  return (
    <div className="mx-auto max-w-[1360px] space-y-5 pb-16 print:max-w-none">
      <PageHeader
        title={tr('لوحة التحكم', 'Dashboard')}
        description={tr(
          'مؤشرات محدثة حسب أدوارك وصلاحياتك ونطاق عملك الفعلي.',
          'Live indicators based on your roles, permissions, and effective work scope.',
        )}
      >
        <Button variant="outline" onClick={() => dashboardQuery.refetch()}>
          <RefreshCw className="me-2 h-4 w-4" />
          {tr('تحديث', 'Refresh')}
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="me-2 h-4 w-4" />
          {tr('طباعة / PDF', 'Print / PDF')}
        </Button>
        <Button onClick={exportDashboard} disabled={exporting}>
          {exporting ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Download className="me-2 h-4 w-4" />}
          {tr('تصدير الإحصائيات', 'Export statistics')}
        </Button>
      </PageHeader>

      <section className="overflow-hidden rounded-3xl border border-teal-100 bg-white shadow-sm">
        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
              <LayoutDashboard className="h-6 w-6" />
            </span>
            <div>
              <p className="text-[11px] font-bold text-teal-700">{tr(focus.titleAr, focus.titleEn)}</p>
              <h1 className="mt-1 text-xl font-black text-slate-900">{tr('أهلاً،', 'Welcome,')} {dashboard.profile.name}</h1>
              <p className="mt-2 max-w-3xl text-xs leading-6 text-slate-500">{tr(focus.descriptionAr, focus.descriptionEn)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {dashboard.profile.roles.map((role) => {
                  const label = ROLE_LABELS[role];
                  return (
                    <span key={role} className="rounded-full border border-teal-100 bg-teal-50 px-3 py-1 text-[10px] font-bold text-teal-700">
                      {label ? (ar ? label.ar : label.en) : role}
                    </span>
                  );
                })}
                {dashboard.profile.assigned_levels.map((level) => (
                  <span key={level} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-bold text-slate-500">
                    {tr(`نطاق الدفعة: ${level === 'fourth' ? 'الرابعة' : level === 'fifth' ? 'الخامسة' : level === 'sixth' ? 'السادسة' : level}`, `Cohort scope: ${level}`)}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="rounded-2xl bg-teal-50 px-5 py-4 text-center">
            <p className="text-2xl font-black text-teal-700">{dashboard.profile.scope_student_count}</p>
            <p className="mt-1 text-[10px] font-bold text-teal-800">{tr('طالب ضمن نطاق البيانات', 'Students in data scope')}</p>
            <p className="mt-1 text-[9px] text-teal-600">{localizedDate(dashboard.generated_at, locale, true)}</p>
          </div>
        </div>
      </section>

      {dashboard.attention.length > 0 && (
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-teal-700" />
            <h2 className="text-sm font-black text-slate-900">{tr('يحتاج إلى متابعتك', 'Requires your attention')}</h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {dashboard.attention.map((item) => (
              <Link key={item.key} to={item.route} className="group flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3 transition hover:border-teal-200 hover:bg-teal-50">
                <div>
                  <p className="text-xs font-black text-slate-800">{ar ? item.label_ar : item.label_en}</p>
                  <p className="mt-1 text-[10px] text-slate-500">{tr('فتح شاشة المتابعة', 'Open follow-up screen')}</p>
                </div>
                <span className="flex h-9 min-w-9 items-center justify-center rounded-xl bg-white px-2 text-sm font-black text-teal-700 shadow-sm">{item.count}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {displayedMetrics.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-black text-slate-900">{tr('المؤشرات الرئيسية', 'Key indicators')}</h2>
              <p className="mt-1 text-[10px] text-slate-500">{tr('القيم المعروضة مقيدة بنطاق حسابك.', 'Displayed values are restricted to your account scope.')}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
            {displayedMetrics.map((metric) => {
              const Icon = metricIcons[metric.key] ?? Activity;
              return (
                <Link key={metric.key} to={metric.route} className="group rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-teal-200 hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
                      <Icon className="h-4 w-4" />
                    </span>
                    <ArrowLeft className="h-3.5 w-3.5 text-slate-300 transition group-hover:-translate-x-1 group-hover:text-teal-600 rtl:rotate-180" />
                  </div>
                  <p className="mt-4 text-2xl font-black text-slate-900">{metric.value.toLocaleString(locale === 'ar' ? 'ar-PS' : 'en-GB')}{metric.unit && <span className="ms-1 text-xs text-teal-700">{metric.unit}</span>}</p>
                  <p className="mt-1 min-h-8 text-[10px] font-bold leading-4 text-slate-500">{ar ? metric.label_ar : metric.label_en}</p>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {displayedCharts.length > 0 && (
        <section>
          <div className="mb-3">
            <h2 className="text-sm font-black text-slate-900">{tr('التحليلات والمقارنات', 'Analytics and comparisons')}</h2>
            <p className="mt-1 text-[10px] text-slate-500">{tr('رسوم مبنية مباشرة على البيانات المسجلة في النظام.', 'Charts generated directly from recorded system data.')}</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {displayedCharts.map((chart) => <ChartCard key={chart.key} chart={chart} ar={ar} />)}
          </div>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-teal-700" />
              <h2 className="text-sm font-black text-slate-900">{tr('آخر النشاطات المرتبطة بك', 'Your recent activity')}</h2>
            </div>
          </header>
          {dashboard.activity.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">{tr('لا توجد نشاطات حديثة ضمن نطاقك.', 'No recent activity in your scope.')}</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {dashboard.activity.map((item) => (
                <Link key={item.key} to={item.route} className="flex items-start gap-3 px-5 py-3.5 transition hover:bg-slate-50">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                    {item.type === 'task' ? <ListChecks className="h-4 w-4" /> : item.type === 'correspondence' ? <Mail className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-black text-slate-800">{item.title}</p>
                    <p className="mt-1 text-[10px] text-slate-500">{ar ? item.subtitle_ar : item.subtitle_en}</p>
                  </div>
                  <time className="shrink-0 text-[9px] text-slate-400">{localizedDate(item.at, locale)}</time>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-teal-700" />
            <h2 className="text-sm font-black text-slate-900">{tr('وصول سريع', 'Quick access')}</h2>
          </div>
          {quickActions.length === 0 ? (
            <p className="rounded-2xl bg-slate-50 p-4 text-xs text-slate-500">{tr('لا توجد شاشات إضافية ضمن صلاحيات الحساب.', 'No additional screens are available for this account.')}</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {quickActions.slice(0, 8).map((action) => {
                const Icon = action.icon;
                return (
                  <Link key={action.route} to={action.route} className="flex items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50/70 p-3 text-[11px] font-bold text-slate-700 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700">
                    <Icon className="h-4 w-4 shrink-0 text-teal-600" />
                    {ar ? action.labelAr : action.labelEn}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function ChartCard({ chart, ar }: { chart: Chart; ar: boolean }) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
          <BarChart3 className="h-4 w-4" />
        </span>
        <h3 className="text-xs font-black text-slate-800">{ar ? chart.title_ar : chart.title_en}</h3>
      </div>
      {chart.type === 'donut' ? <DonutChart items={chart.items} ar={ar} /> : chart.type === 'line' ? <LineChart items={chart.items} ar={ar} /> : <BarComparison items={chart.items} ar={ar} />}
    </article>
  );
}

function BarComparison({ items, ar }: { items: ChartItem[]; ar: boolean }) {
  const maximum = Math.max(1, ...items.map((item) => Number(item.value)));
  return (
    <div className="space-y-3">
      {items.slice(0, 8).map((item, index) => (
        <div key={`${item.label_en}-${index}`}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-[10px]">
            <span className="truncate font-bold text-slate-600">{ar ? item.label_ar : item.label_en}</span>
            <span className="font-black text-teal-700">{item.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-teal-500" style={{ width: `${(Number(item.value) / maximum) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function DonutChart({ items, ar }: { items: ChartItem[]; ar: boolean }) {
  const total = items.reduce((sum, item) => sum + Number(item.value), 0);
  let offset = 0;
  const gradient = items.map((item, index) => {
    const start = total > 0 ? (offset / total) * 100 : 0;
    offset += Number(item.value);
    const end = total > 0 ? (offset / total) * 100 : 0;
    return `${chartColors[index % chartColors.length]} ${start}% ${end}%`;
  }).join(', ');

  return (
    <div className="grid grid-cols-[7.5rem_1fr] items-center gap-4">
      <div className="relative mx-auto h-28 w-28 rounded-full" style={{ background: total > 0 ? `conic-gradient(${gradient})` : '#f1f5f9' }}>
        <div className="absolute inset-4 flex flex-col items-center justify-center rounded-full bg-white">
          <span className="text-xl font-black text-slate-900">{total}</span>
          <span className="text-[9px] font-bold text-slate-400">{ar ? 'الإجمالي' : 'Total'}</span>
        </div>
      </div>
      <div className="space-y-2">
        {items.slice(0, 6).map((item, index) => (
          <div key={`${item.label_en}-${index}`} className="flex items-center justify-between gap-2 text-[10px]">
            <span className="flex min-w-0 items-center gap-2">
              <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: chartColors[index % chartColors.length] }} />
              <span className="truncate font-bold text-slate-600">{ar ? item.label_ar : item.label_en}</span>
            </span>
            <b className="text-slate-800">{item.value}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineChart({ items, ar }: { items: ChartItem[]; ar: boolean }) {
  const values = items.map((item) => Number(item.value));
  const maximum = Math.max(1, ...values);
  const width = 420;
  const height = 125;
  const points = items.map((item, index) => {
    const x = items.length > 1 ? (index / (items.length - 1)) * (width - 28) + 14 : width / 2;
    const y = height - 18 - (Number(item.value) / maximum) * (height - 38);
    return { x, y, item };
  });

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-32 w-full overflow-visible" role="img">
        {[0.25, 0.5, 0.75].map((ratio) => <line key={ratio} x1="12" x2={width - 12} y1={height * ratio} y2={height * ratio} stroke="#e2e8f0" strokeWidth="1" />)}
        <polyline fill="none" stroke="#0d9488" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={points.map((point) => `${point.x},${point.y}`).join(' ')} />
        {points.map((point, index) => (
          <g key={index}>
            <circle cx={point.x} cy={point.y} r="4" fill="#ffffff" stroke="#0d9488" strokeWidth="3" />
            <text x={point.x} y={point.y - 10} textAnchor="middle" fontSize="10" fontWeight="700" fill="#0f766e">{point.item.value}</text>
          </g>
        ))}
      </svg>
      <div className="grid text-center text-[8px] font-semibold text-slate-400" style={{ gridTemplateColumns: `repeat(${Math.max(1, items.length)}, minmax(0, 1fr))` }}>
        {items.map((item, index) => <span key={index} className="truncate px-0.5">{ar ? item.label_ar : item.label_en}</span>)}
      </div>
    </div>
  );
}
