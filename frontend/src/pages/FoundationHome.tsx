import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ExcelJS from 'exceljs';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
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
  const [selectedChartKey, setSelectedChartKey] = useState('');

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
  const highlightedMetrics = displayedMetrics.slice(0, 4);
  const remainingMetrics = displayedMetrics.slice(4);
  const activeChart = displayedCharts.find((chart) => chart.key === selectedChartKey) ?? displayedCharts[0];

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
    <div className="mx-auto max-w-[1440px] space-y-4 pb-12 print:max-w-none">
      <header className="rounded-[28px] border border-slate-200 bg-white px-4 py-4 shadow-[0_8px_30px_rgba(15,23,42,0.04)] sm:px-6 sm:py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-start gap-3 sm:items-center">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 ring-1 ring-teal-100">
              <LayoutDashboard className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h1 className="text-lg font-black tracking-tight text-slate-950 sm:text-xl">{tr('مرحباً،', 'Welcome,')} {dashboard.profile.name}</h1>
                <span className="hidden h-1 w-1 rounded-full bg-slate-300 sm:block" />
                <span className="text-[10px] font-bold text-teal-700">{tr(focus.titleAr, focus.titleEn)}</span>
              </div>
              <p className="mt-1 max-w-3xl truncate text-[10px] text-slate-500 sm:text-xs">{tr(focus.descriptionAr, focus.descriptionEn)}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {dashboard.profile.roles.map((role) => {
                  const label = ROLE_LABELS[role];
                  return <span key={role} className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-bold text-slate-600">{label ? (ar ? label.ar : label.en) : role}</span>;
                })}
                {dashboard.profile.assigned_levels.map((level) => <span key={level} className="rounded-full bg-teal-50 px-2.5 py-1 text-[9px] font-bold text-teal-700">{tr(`دفعة ${level === 'fourth' ? 'رابعة' : level === 'fifth' ? 'خامسة' : level === 'sixth' ? 'سادسة' : level}`, `${level} cohort`)}</span>)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 xl:pb-0">
            <button onClick={() => dashboardQuery.refetch()} className="flex h-10 shrink-0 items-center gap-2 rounded-xl border border-slate-200 px-3 text-[10px] font-bold text-slate-600 transition hover:border-teal-200 hover:text-teal-700">
              <RefreshCw className="h-4 w-4" /> <span className="hidden sm:inline">{tr('تحديث', 'Refresh')}</span>
            </button>
            <button onClick={() => window.print()} className="flex h-10 shrink-0 items-center gap-2 rounded-xl border border-slate-200 px-3 text-[10px] font-bold text-slate-600 transition hover:border-teal-200 hover:text-teal-700">
              <Printer className="h-4 w-4" /> <span className="hidden sm:inline">{tr('طباعة', 'Print')}</span>
            </button>
            <button onClick={exportDashboard} disabled={exporting} className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-teal-600 px-4 text-[10px] font-black text-white shadow-sm transition hover:bg-teal-700 disabled:opacity-60">
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} {tr('تصدير الإحصائيات', 'Export statistics')}
            </button>
          </div>
        </div>
      </header>

      <section className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.05)]">
        {highlightedMetrics.length > 0 && (
          <div className="grid grid-cols-2 border-b border-slate-100 lg:grid-cols-4">
            {highlightedMetrics.map((metric, index) => {
              const Icon = metricIcons[metric.key] ?? Activity;
              return (
                <Link key={metric.key} to={metric.route} className={`group relative flex min-h-28 items-center gap-3 px-4 py-4 transition hover:bg-teal-50/60 sm:px-6 ${index % 2 !== 0 ? 'border-s border-slate-100' : ''} ${index > 1 ? 'border-t border-slate-100 lg:border-t-0' : ''} ${index > 0 ? 'lg:border-s lg:border-slate-100' : ''}`}>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 ring-1 ring-teal-100"><Icon className="h-4.5 w-4.5" /></span>
                  <div className="min-w-0">
                    <p className="text-xl font-black tabular-nums text-slate-950 sm:text-2xl">{metric.value.toLocaleString(locale === 'ar' ? 'ar-PS' : 'en-GB')}<span className="ms-1 text-[10px] text-teal-700">{metric.unit}</span></p>
                    <p className="mt-1 line-clamp-2 text-[9px] font-bold leading-4 text-slate-500 sm:text-[10px]">{ar ? metric.label_ar : metric.label_en}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <div className="grid min-h-[440px] xl:grid-cols-[minmax(0,1fr)_330px]">
          <div className="min-w-0 p-4 sm:p-6 xl:border-e xl:border-slate-100">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-teal-600">{tr('التحليل التنفيذي', 'Executive analytics')}</p>
                <h2 className="mt-1 text-base font-black text-slate-950">{activeChart ? (ar ? activeChart.title_ar : activeChart.title_en) : tr('ملخص الأداء', 'Performance summary')}</h2>
                <p className="mt-1 text-[10px] text-slate-400">{tr('بيانات محدثة ومقيدة ضمن نطاق صلاحيات الحساب', 'Live data restricted to the account permission scope')}</p>
              </div>
              <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-50 p-1">
                {displayedCharts.map((chart, index) => (
                  <button key={chart.key} onClick={() => setSelectedChartKey(chart.key)} className={`shrink-0 rounded-lg px-3 py-2 text-[9px] font-bold transition ${activeChart?.key === chart.key ? 'bg-white text-teal-700 shadow-sm ring-1 ring-slate-100' : 'text-slate-400 hover:text-slate-700'}`}>
                    {index + 1}. {ar ? chart.title_ar : chart.title_en}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-7 min-h-[290px]">{activeChart ? <ExecutiveChart chart={activeChart} ar={ar} /> : <div className="flex h-72 items-center justify-center text-xs text-slate-400">{tr('لا توجد بيانات كافية للرسم بعد.', 'Not enough data to chart yet.')}</div>}</div>
          </div>

          <aside className="bg-slate-50/45 p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs font-black text-slate-900">{tr('مركز المتابعة', 'Follow-up center')}</h2>
                <p className="mt-1 text-[9px] text-slate-400">{tr('الأولوية والإجراءات المطلوبة', 'Priorities and required actions')}</p>
              </div>
              <span className="flex h-9 min-w-9 items-center justify-center rounded-xl bg-white px-2 text-sm font-black text-teal-700 shadow-sm ring-1 ring-slate-100">{dashboard.attention.reduce((sum, item) => sum + item.count, 0)}</span>
            </div>
            <div className="mt-4 space-y-2">
              {dashboard.attention.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-teal-200 bg-teal-50/50 p-5 text-center"><CheckCircle2 className="mx-auto h-5 w-5 text-teal-600" /><p className="mt-2 text-[10px] font-bold text-teal-800">{tr('لا توجد عناصر عاجلة', 'No urgent items')}</p></div>
              ) : dashboard.attention.slice(0, 6).map((item) => (
                <Link key={item.key} to={item.route} className="group flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-slate-100 transition hover:ring-teal-200">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-[11px] font-black text-teal-700">{item.count}</span>
                  <div className="min-w-0 flex-1"><p className="truncate text-[10px] font-black text-slate-700">{ar ? item.label_ar : item.label_en}</p><p className="mt-1 text-[8px] text-slate-400">{tr('عرض التفاصيل والمتابعة', 'Review and follow up')}</p></div>
                  <ArrowLeft className="h-3.5 w-3.5 text-slate-300 rtl:rotate-180" />
                </Link>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(330px,.85fr)]">
        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="text-xs font-black text-slate-900">{tr('باقي مؤشرات الأداء', 'Additional performance indicators')}</h2><p className="mt-1 text-[9px] text-slate-400">{tr('عرض مركز بدون بطاقات إضافية', 'A focused view without extra cards')}</p></div><BarChart3 className="h-4 w-4 text-teal-600" /></div>
          {remainingMetrics.length === 0 ? <p className="p-6 text-center text-[10px] text-slate-400">{tr('جميع المؤشرات معروضة في الملخص.', 'All indicators are shown in the summary.')}</p> : (
            <div className="grid sm:grid-cols-2">
              {remainingMetrics.map((metric, index) => {
                const Icon = metricIcons[metric.key] ?? Activity;
                return <Link key={metric.key} to={metric.route} className={`flex items-center gap-3 px-5 py-3.5 transition hover:bg-teal-50/50 ${index > 0 ? 'border-t border-slate-100' : ''} ${index === 1 ? 'sm:border-t-0' : ''} ${index % 2 === 1 ? 'sm:border-s sm:border-slate-100' : ''}`}><Icon className="h-4 w-4 shrink-0 text-teal-600" /><span className="min-w-0 flex-1 truncate text-[10px] font-bold text-slate-600">{ar ? metric.label_ar : metric.label_en}</span><strong className="text-sm tabular-nums text-slate-900">{metric.value}{metric.unit}</strong></Link>;
              })}
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4"><Clock3 className="h-4 w-4 text-teal-600" /><h2 className="text-xs font-black text-slate-900">{tr('آخر النشاطات', 'Recent activity')}</h2></div>
          {dashboard.activity.length === 0 ? <p className="p-8 text-center text-[10px] text-slate-400">{tr('لا توجد نشاطات حديثة ضمن نطاقك.', 'No recent activity in your scope.')}</p> : (
            <div className="divide-y divide-slate-100">{dashboard.activity.slice(0, 5).map((item) => <Link key={item.key} to={item.route} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-slate-50"><span className="h-2 w-2 shrink-0 rounded-full bg-teal-500" /><div className="min-w-0 flex-1"><p className="truncate text-[10px] font-black text-slate-700">{item.title}</p><p className="mt-1 text-[8px] text-slate-400">{ar ? item.subtitle_ar : item.subtitle_en}</p></div><time className="shrink-0 text-[8px] text-slate-400">{localizedDate(item.at, locale)}</time></Link>)}</div>
          )}
        </div>
      </section>

      {quickActions.length > 0 && <nav className="flex items-center gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">{quickActions.slice(0, 9).map((action) => { const Icon = action.icon; return <Link key={action.route} to={action.route} className="flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-[9px] font-bold text-slate-600 transition hover:bg-teal-50 hover:text-teal-700"><Icon className="h-4 w-4 text-teal-600" />{ar ? action.labelAr : action.labelEn}</Link>; })}</nav>}
    </div>
  );
}

function ExecutiveChart({ chart, ar }: { chart: Chart; ar: boolean }) {
  if (chart.type === 'donut') return <ExecutiveDonut items={chart.items} ar={ar} />;
  if (chart.type === 'line') return <ExecutiveLine items={chart.items} ar={ar} />;
  return <ExecutiveBars items={chart.items} ar={ar} />;
}

function ExecutiveBars({ items, ar }: { items: ChartItem[]; ar: boolean }) {
  const visible = items.slice(0, 10);
  const maximum = Math.max(1, ...visible.map((item) => Number(item.value)));
  const width = 760;
  const top = 24;
  const bottom = 225;
  const chartHeight = bottom - top;
  const slot = (width - 76) / Math.max(1, visible.length);
  const barWidth = Math.min(48, slot * .54);
  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${width} 280`} className="h-[270px] w-full" role="img">
        <defs><linearGradient id="dashboardBars" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2dd4bf" /><stop offset="100%" stopColor="#0f766e" /></linearGradient></defs>
        {[0, .25, .5, .75, 1].map((ratio) => <g key={ratio}><line x1="38" x2={width - 38} y1={top + chartHeight * ratio} y2={top + chartHeight * ratio} stroke="#e8eef2" strokeDasharray="4 6" /><text x="28" y={top + chartHeight * ratio + 4} textAnchor="end" fontSize="9" fill="#94a3b8">{Math.round(maximum * (1 - ratio))}</text></g>)}
        {visible.map((item, index) => {
          const barHeight = (Number(item.value) / maximum) * chartHeight;
          const x = 38 + slot * index + (slot - barWidth) / 2;
          return <g key={`${item.label_en}-${index}`}><rect x={x} y={bottom - barHeight} width={barWidth} height={Math.max(2, barHeight)} rx="8" fill="url(#dashboardBars)" /><text x={x + barWidth / 2} y={bottom - barHeight - 9} textAnchor="middle" fontSize="10" fontWeight="800" fill="#0f766e">{item.value}</text><text x={x + barWidth / 2} y="255" textAnchor="middle" fontSize="9" fontWeight="600" fill="#64748b">{truncateLabel(ar ? item.label_ar : item.label_en)}</text></g>;
        })}
      </svg>
    </div>
  );
}

function ExecutiveDonut({ items, ar }: { items: ChartItem[]; ar: boolean }) {
  const visible = items.slice(0, 8);
  const total = visible.reduce((sum, item) => sum + Number(item.value), 0);
  let offset = 0;
  const gradient = visible.map((item, index) => {
    const start = total > 0 ? (offset / total) * 100 : 0;
    offset += Number(item.value);
    const end = total > 0 ? (offset / total) * 100 : 0;
    return `${chartColors[index % chartColors.length]} ${start}% ${end}%`;
  }).join(', ');

  return (
    <div className="grid min-h-[270px] items-center gap-7 sm:grid-cols-[260px_minmax(0,1fr)]">
      <div className="relative mx-auto h-52 w-52 rounded-full shadow-[0_20px_45px_rgba(13,148,136,.12)]" style={{ background: total > 0 ? `conic-gradient(${gradient})` : '#e2e8f0' }}>
        <div className="absolute inset-[30px] flex flex-col items-center justify-center rounded-full bg-white shadow-inner">
          <span className="text-3xl font-black tabular-nums text-slate-950">{total}</span>
          <span className="mt-1 text-[9px] font-bold uppercase tracking-widest text-slate-400">{ar ? 'الإجمالي' : 'Total'}</span>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {visible.map((item, index) => {
          const percentage = total ? Math.round((Number(item.value) / total) * 100) : 0;
          return <div key={`${item.label_en}-${index}`} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-3"><i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: chartColors[index % chartColors.length] }} /><div className="min-w-0 flex-1"><p className="truncate text-[9px] font-bold text-slate-500">{ar ? item.label_ar : item.label_en}</p><p className="mt-1 text-sm font-black text-slate-900">{item.value} <span className="text-[9px] font-bold text-slate-400">({percentage}%)</span></p></div></div>;
        })}
      </div>
    </div>
  );
}

function ExecutiveLine({ items, ar }: { items: ChartItem[]; ar: boolean }) {
  const visible = items.slice(0, 10);
  const values = visible.map((item) => Number(item.value));
  const maximum = Math.max(1, ...values);
  const width = 760;
  const top = 24;
  const bottom = 225;
  const chartHeight = bottom - top;
  const points = visible.map((item, index) => {
    const x = visible.length > 1 ? 38 + (index / (visible.length - 1)) * (width - 76) : width / 2;
    const y = bottom - (Number(item.value) / maximum) * chartHeight;
    return { x, y, item };
  });
  const linePoints = points.map((point) => `${point.x},${point.y}`).join(' ');
  const areaPoints = `38,${bottom} ${linePoints} ${width - 38},${bottom}`;

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${width} 280`} className="h-[270px] w-full" role="img">
        <defs><linearGradient id="dashboardArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#14b8a6" stopOpacity=".25" /><stop offset="100%" stopColor="#14b8a6" stopOpacity="0" /></linearGradient></defs>
        {[0, .25, .5, .75, 1].map((ratio) => <g key={ratio}><line x1="38" x2={width - 38} y1={top + chartHeight * ratio} y2={top + chartHeight * ratio} stroke="#e8eef2" strokeDasharray="4 6" /><text x="28" y={top + chartHeight * ratio + 4} textAnchor="end" fontSize="9" fill="#94a3b8">{Math.round(maximum * (1 - ratio))}</text></g>)}
        <polygon points={areaPoints} fill="url(#dashboardArea)" />
        <polyline fill="none" stroke="#0d9488" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" points={linePoints} />
        {points.map((point, index) => <g key={index}><circle cx={point.x} cy={point.y} r="5" fill="#fff" stroke="#0d9488" strokeWidth="3" /><text x={point.x} y={point.y - 13} textAnchor="middle" fontSize="10" fontWeight="800" fill="#0f766e">{point.item.value}</text><text x={point.x} y="255" textAnchor="middle" fontSize="9" fontWeight="600" fill="#64748b">{truncateLabel(ar ? point.item.label_ar : point.item.label_en)}</text></g>)}
      </svg>
    </div>
  );
}

function truncateLabel(value: string): string {
  return value.length > 13 ? `${value.slice(0, 11)}…` : value;
}
