import { useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Activity, CheckCircle2, Clock3, Mail, RefreshCw } from 'lucide-react';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';

type ChartItem = { label_ar: string; label_en: string; value: number };
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
  charts?: Chart[];
  attention: AttentionItem[];
  activity: ActivityItem[];
  generated_at: string;
};
type GroupKey = 'attendance' | 'students' | 'academic' | 'operations' | 'system';

const roleLabels: Record<string, { ar: string; en: string }> = {
  SYS_ADMIN: { ar: 'مدير النظام', en: 'System administrator' },
  CLINICAL_DIRECTOR: { ar: 'مدير الدائرة السريرية', en: 'Clinical department director' },
  DEPARTMENT_HEAD: { ar: 'رئيس القسم الأكاديمي', en: 'Academic department head' },
  DEAN: { ar: 'عميد الكلية', en: 'Faculty dean' },
  VICE_DEAN: { ar: 'نائب العميد', en: 'Vice dean' },
  RTA: { ar: 'مساعد بحث وتدريس', en: 'Research and teaching assistant' },
  ACADEMIC_ADVISOR: { ar: 'مرشد أكاديمي', en: 'Academic advisor' },
  QUALITY: { ar: 'مسؤول الجودة', en: 'Quality officer' },
  ADMIN_ASSISTANT: { ar: 'مساعد إداري', en: 'Administrative assistant' },
  CLINICAL_SUPERVISOR: { ar: 'مشرف سريري', en: 'Clinical supervisor' },
};
const focusRole: Record<string, string> = {
  system: 'SYS_ADMIN',
  clinical_leadership: 'CLINICAL_DIRECTOR',
  faculty_leadership: 'DEAN',
  department: 'DEPARTMENT_HEAD',
  cohort: 'RTA',
  advising: 'ACADEMIC_ADVISOR',
  quality: 'QUALITY',
  operations: 'ADMIN_ASSISTANT',
  supervisor: 'CLINICAL_SUPERVISOR',
};

const chartGroups: { key: GroupKey; ar: string; en: string; keys: string[] }[] = [
  { key: 'attendance', ar: 'الحضور والغياب', en: 'Attendance', keys: ['attendance_status', 'absence_trend'] },
  { key: 'students', ar: 'الطلبة والتوزيع', en: 'Students and placements', keys: ['students_by_level', 'academic_registration', 'distribution_departments', 'registration_cycles_status'] },
  { key: 'academic', ar: 'التقييمات والعلامات', en: 'Assessments and grades', keys: ['assessment_workflow', 'grade_workflow'] },
  { key: 'operations', ar: 'العمل اليومي', en: 'Daily operations', keys: ['my_tasks_status', 'correspondence_status', 'meeting_status', 'quality_overview', 'advising_status'] },
  { key: 'system', ar: 'النظام', en: 'System', keys: ['users_by_role'] },
];

const focusOrder: Record<string, GroupKey[]> = {
  clinical_leadership: ['attendance', 'students', 'academic', 'operations', 'system'],
  cohort: ['attendance', 'students', 'academic', 'operations', 'system'],
  department: ['academic', 'attendance', 'students', 'operations', 'system'],
  operations: ['students', 'operations', 'attendance', 'academic', 'system'],
  system: ['system', 'operations', 'students', 'attendance', 'academic'],
};

const colors = ['#0f766e', '#14b8a6', '#f59e0b', '#6366f1', '#e879f9', '#94a3b8', '#ef4444', '#0891b2'];

function formatNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-PS' : 'en-GB', { maximumFractionDigits: 1 }).format(value);
}

function localizedDate(value: string, locale: string, withTime = false) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale === 'ar' ? 'ar-PS' : 'en-GB', {
    year: 'numeric', month: 'short', day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

function DashboardChart({ chart, locale }: { chart: Chart; locale: string }) {
  const ar = locale === 'ar';
  const items = chart.items.filter((item) => Number.isFinite(item.value) && item.value >= 0);
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const title = ar ? chart.title_ar : chart.title_en;
  if (total <= 0) return null;

  return <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label={title}>
    <div className="mb-4 flex items-center justify-between gap-2">
      <h3 className="text-sm font-black text-slate-900">{title}</h3>
    </div>
    {chart.type === 'donut' ? <DonutChart items={items} total={total} locale={locale} title={title} />
      : chart.type === 'line' ? <LineChart items={items} locale={locale} title={title} />
      : <BarChart items={items} locale={locale} />}
  </article>;
}

function BarChart({ items, locale }: { items: ChartItem[]; locale: string }) {
  const ar = locale === 'ar';
  const maximum = Math.max(...items.map((item) => item.value), 1);
  return <div className="space-y-3">
    {items.map((item, index) => <div key={`${item.label_en}-${index}`}>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
        <span className="min-w-0 truncate font-semibold text-slate-700" title={ar ? item.label_ar : item.label_en}>{ar ? item.label_ar : item.label_en}</span>
        <strong className="shrink-0 tabular-nums text-slate-900">{formatNumber(item.value, locale)}</strong>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${ar ? item.label_ar : item.label_en}: ${formatNumber(item.value, locale)}`}>
        <div className="h-full rounded-full transition-all" style={{ width: `${(item.value / maximum) * 100}%`, backgroundColor: colors[index % colors.length] }} />
      </div>
    </div>)}
  </div>;
}

function DonutChart({ items, total, locale, title }: { items: ChartItem[]; total: number; locale: string; title: string }) {
  const ar = locale === 'ar';
  let offset = 0;
  const segments = items.map((item, index) => {
    const start = offset;
    offset += (item.value / total) * 100;
    return `${colors[index % colors.length]} ${start}% ${offset}%`;
  });
  const ringStyle: CSSProperties = { background: `conic-gradient(${segments.join(', ')})` };
  return <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
    <div className="relative grid h-28 w-28 shrink-0 place-items-center rounded-full" style={ringStyle} role="img" aria-label={`${title}: ${items.map((item) => `${ar ? item.label_ar : item.label_en} ${formatNumber(item.value, locale)}`).join('، ')}`}>
      <div className="grid h-20 w-20 place-items-center rounded-full bg-white text-lg font-black tabular-nums text-slate-900">{formatNumber(total, locale)}</div>
    </div>
    <ul className="grid w-full min-w-0 gap-2 text-xs">
      {items.map((item, index) => <li key={`${item.label_en}-${index}`} className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
        <span className="min-w-0 flex-1 truncate text-slate-600">{ar ? item.label_ar : item.label_en}</span>
        <strong className="shrink-0 tabular-nums text-slate-900">{formatNumber(item.value, locale)}</strong>
      </li>)}
    </ul>
  </div>;
}

function LineChart({ items, locale, title }: { items: ChartItem[]; locale: string; title: string }) {
  const ar = locale === 'ar';
  const maximum = Math.max(...items.map((item) => item.value), 1);
  const points = items.map((item, index) => ({
    x: items.length === 1 ? 160 : 12 + (index / (items.length - 1)) * 296,
    y: 94 - (item.value / maximum) * 78,
    item,
  }));
  return <div>
    <svg viewBox="0 0 320 112" className="h-32 w-full" preserveAspectRatio="none" role="img" aria-label={`${title}: ${items.map((item) => `${ar ? item.label_ar : item.label_en} ${formatNumber(item.value, locale)}`).join('، ')}`}>
      <path d="M12 94 H308" stroke="#e2e8f0" strokeWidth="1" />
      <polyline points={points.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="#0f766e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="4" fill="#0f766e" stroke="white" strokeWidth="2" />)}
    </svg>
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((item, index) => <div key={index} className="min-w-0 text-center"><span className="block truncate text-[9px] text-slate-500" title={ar ? item.label_ar : item.label_en}>{ar ? item.label_ar : item.label_en}</span><strong className="block text-[10px] tabular-nums text-slate-800">{formatNumber(item.value, locale)}</strong></div>)}
    </div>
  </div>;
}

export function FoundationHome() {
  const { user } = useAuth();
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const tr = (arabic: string, english: string) => ar ? arabic : english;
  const [activeGroup, setActiveGroup] = useState<GroupKey | null>(null);
  const dashboardQuery = useQuery({
    queryKey: ['role-dashboard-overview', user?.id],
    queryFn: () => apiFetch<DashboardOverview>('/dashboard/overview'),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  if (dashboardQuery.isLoading) return <LoadingState />;
  if (dashboardQuery.isError || !dashboardQuery.data) return <ErrorState title={tr('تعذر تحميل لوحة التحكم', 'Could not load dashboard')} onRetry={() => dashboardQuery.refetch()} />;

  const dashboard = dashboardQuery.data;
  const preferredRole = focusRole[dashboard.profile.focus];
  const primaryRole = dashboard.profile.roles.includes(preferredRole)
    ? preferredRole
    : dashboard.profile.roles.find((role) => roleLabels[role] && role !== 'CLINICAL_SUPERVISOR') || dashboard.profile.roles[0];
  const role = roleLabels[primaryRole];
  const availableCharts = (dashboard.charts ?? []).filter((chart) => chart.items.some((item) => Number.isFinite(item.value) && item.value > 0));
  const availableGroups = chartGroups.filter((group) => availableCharts.some((chart) => group.keys.includes(chart.key)));
  const preferredGroups = focusOrder[dashboard.profile.focus] ?? focusOrder.clinical_leadership;
  availableGroups.sort((a, b) => preferredGroups.indexOf(a.key) - preferredGroups.indexOf(b.key));
  const currentGroup = availableGroups.find((group) => group.key === activeGroup) ?? availableGroups[0];
  const displayedCharts = currentGroup ? availableCharts.filter((chart) => currentGroup.keys.includes(chart.key)) : [];

  return <main aria-label={tr('مساحة العمل اليومية', 'Daily workspace')} className="mx-auto w-full min-w-0 max-w-[1380px] space-y-4 pb-10 sm:space-y-5">
    <header className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 p-5 text-white shadow-lg shadow-slate-900/10 sm:p-8">
      <div aria-hidden="true" className="pointer-events-none absolute -end-12 -top-20 h-56 w-56 rounded-full border border-white/10 bg-white/5" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 end-28 h-56 w-56 rounded-full border border-teal-300/10" />
      <div className="relative flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <span className="inline-flex rounded-full border border-teal-200/20 bg-white/10 px-3 py-1 text-[11px] font-bold text-teal-100">{role ? ar ? role.ar : role.en : tr('لوحة العمل', 'Workspace')}</span>
          <h1 className="mt-4 break-words text-2xl font-black tracking-tight sm:text-3xl">{tr('مرحباً،', 'Welcome,')} {dashboard.profile.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-300">
            <time>{localizedDate(dashboard.generated_at, locale, true)}</time>
            {dashboard.profile.assigned_levels.length > 0 && <span>{tr('دفعاتك:', 'Cohorts:')} {dashboard.profile.assigned_levels.join('، ')}</span>}
          </div>
        </div>
        <button type="button" onClick={() => dashboardQuery.refetch()} disabled={dashboardQuery.isFetching} aria-label={tr('تحديث البيانات', 'Refresh dashboard')} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 text-xs font-bold text-white transition hover:bg-white/20 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${dashboardQuery.isFetching ? 'animate-spin' : ''}`} />{tr('تحديث', 'Refresh')}</button>
      </div>
    </header>

    <section aria-label={tr('الرسوم البيانية', 'Dashboard charts')} className="space-y-3">
      <div><h2 className="text-base font-black text-slate-900">{tr('المؤشرات البيانية', 'Visual indicators')}</h2><p className="mt-1 text-[11px] text-slate-500">{tr('اختر المجال لعرض تفاصيله.', 'Choose an area to view its details.')}</p></div>
      {availableGroups.length > 0 ? <>
        <div role="tablist" aria-label={tr('مجالات الرسوم', 'Chart areas')} className="flex gap-2 overflow-x-auto pb-1">
          {availableGroups.map((group) => <button key={group.key} type="button" role="tab" aria-selected={currentGroup?.key === group.key} onClick={() => setActiveGroup(group.key)} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold transition ${currentGroup?.key === group.key ? 'bg-teal-700 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:border-teal-200'}`}>{ar ? group.ar : group.en}</button>)}
        </div>
        <div role="tabpanel" aria-label={currentGroup ? ar ? currentGroup.ar : currentGroup.en : undefined} className="grid gap-3 lg:grid-cols-2">{displayedCharts.map((chart) => <DashboardChart key={chart.key} chart={chart} locale={locale} />)}</div>
      </> : <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">{tr('لا تتوفر بيانات بيانية ضمن نطاقك بعد.', 'No chart data is available in your scope yet.')}</p>}
    </section>

    <div className="grid gap-4 pt-1 lg:grid-cols-2">
      <section aria-label={tr('ما يحتاج متابعتك', 'Needs your attention')} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-50 text-amber-700"><CheckCircle2 className="h-4 w-4" /></span><h2 className="text-sm font-black text-slate-900">{tr('ما يحتاج متابعتك', 'Needs your attention')}</h2></div>
        {dashboard.attention.length > 0 ? <div className="divide-y divide-slate-100">{dashboard.attention.slice(0, 4).map((item) => <Link key={item.key} to={item.route} className="flex min-w-0 items-center gap-3 py-3 text-xs transition hover:text-teal-800"><span className={`grid h-7 min-w-7 place-items-center rounded-lg px-1.5 font-black ${item.severity === 'urgent' ? 'bg-red-100 text-red-700' : item.severity === 'review' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-700'}`}>{formatNumber(item.count, locale)}</span><span className="min-w-0 flex-1 font-bold text-slate-700">{ar ? item.label_ar : item.label_en}</span></Link>)}</div>
          : <p className="rounded-xl bg-emerald-50 px-3 py-4 text-xs font-medium text-emerald-800">{tr('لا توجد أعمال معلقة ضمن نطاقك الآن.', 'Nothing in your scope needs action right now.')}</p>}
      </section>
      <section aria-label={tr('آخر التحديثات', 'Recent updates')} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900"><span className="grid h-8 w-8 place-items-center rounded-lg bg-teal-50 text-teal-700"><Clock3 className="h-4 w-4" /></span>{tr('آخر التحديثات', 'Recent updates')}</h2>
        {dashboard.activity.length > 0 ? <div className="divide-y divide-slate-100">{dashboard.activity.slice(0, 4).map((item) => <Link key={item.key} to={item.route} className="flex min-w-0 items-center gap-2 py-2.5 hover:bg-slate-50">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-teal-50 text-teal-700">{item.type === 'correspondence' ? <Mail className="h-4 w-4" /> : item.type === 'task' ? <CheckCircle2 className="h-4 w-4" /> : <Activity className="h-4 w-4" />}</span>
          <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-800">{item.title}</span><span className="block truncate text-[10px] text-slate-500">{ar ? item.subtitle_ar : item.subtitle_en}</span></span>
          <time className="shrink-0 text-[10px] text-slate-400">{localizedDate(item.at, locale)}</time>
        </Link>)}</div> : <p className="rounded-xl bg-slate-50 px-3 py-4 text-xs font-medium text-slate-500">{tr('لا توجد تحديثات حديثة ضمن نطاقك.', 'There are no recent updates in your scope.')}</p>}
      </section>
    </div>
  </main>;
}
