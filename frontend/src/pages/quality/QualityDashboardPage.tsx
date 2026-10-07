import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ClipboardCheck, FileCheck2, LineChart, Target } from 'lucide-react';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { dateOnly } from './dateOnly';

type Plan = { id: number; observation: string; responsible?: string; due_date?: string; status: string; priority: string };
type Survey = { id: number; title: string; questions_count: number; submissions_count?: number; responses_count?: number };
type Kpi = { id: number; code: string; name: string; latest_measurement?: { display_value: string; review_status: string } | null };
type Overview = {
  counts: { surveys: number; kpis: number; plans_open: number; findings_open: number; evidence_expired: number; evidence_expiring: number };
  recent_surveys: Survey[];
  recent_plans: Plan[];
  recent_kpis: Kpi[];
  attention: { overdue_plans: Plan[]; pending_measurements: Array<{ id: number; kpi?: { code: string; name: string } }> };
};

const planStatus: Record<string, [string, string]> = {
  open: ['مفتوحة', 'Open'], in_progress: ['قيد التنفيذ', 'In progress'],
  under_review: ['قيد التحقق', 'Under review'], closed: ['مغلقة', 'Closed'],
};

export function QualityDashboardPage() {
  const { can } = useAuth();
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const [year, setYear] = useState('');
  const options = useQuery({ queryKey: ['quality-options'], queryFn: () => apiFetch<{ academic_years: Array<{ id: number; code: string; is_current: boolean }> }>('/quality-options'), enabled: can('quality.view') });
  const query = useQuery({ queryKey: ['quality-overview', year], queryFn: () => apiFetch<Overview>(`/quality-overview${year ? `?academic_year=${encodeURIComponent(year)}` : ''}`), enabled: can('quality.view') });

  if (!can('quality.view')) return <ErrorState title={ar ? 'غير مصرح' : 'Access denied'} />;
  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) return <ErrorState title={ar ? 'تعذر تحميل مركز الجودة' : 'Unable to load quality center'} onRetry={() => query.refetch()} />;

  const { counts, attention, recent_plans: plans, recent_surveys: surveys, recent_kpis: kpis } = query.data;
  const sections = [
    { to: '/quality/operations', icon: FileCheck2, title: ar ? 'الملاحظات والأدلة' : 'Findings & evidence', count: counts.findings_open, suffix: ar ? 'ملاحظة مفتوحة' : 'open findings' },
    { to: '/quality/improvement', icon: Target, title: ar ? 'خطط التحسين' : 'Improvement plans', count: counts.plans_open, suffix: ar ? 'خطة نشطة' : 'active plans' },
    { to: '/quality/kpis', icon: LineChart, title: ar ? 'مؤشرات الجودة' : 'Quality indicators', count: counts.kpis, suffix: ar ? 'مؤشر' : 'indicators' },
    { to: '/quality/surveys', icon: ClipboardCheck, title: ar ? 'الاستبيانات' : 'Surveys', count: counts.surveys, suffix: ar ? 'استبيان' : 'surveys' },
  ];
  const hasAttention = attention.overdue_plans.length > 0 || attention.pending_measurements.length > 0 || counts.evidence_expired > 0 || counts.evidence_expiring > 0;

  return <div className="mx-auto w-full max-w-7xl space-y-5 pb-14">
    <PageHeader title={ar ? 'مركز الجودة' : 'Quality center'} description={ar ? 'المتابعة والقياس والتحسين في مكان واحد.' : 'Follow-up, measurement, and improvement in one place.'}>
      <label className="block w-full text-xs font-bold text-slate-600 sm:w-auto">
        <span className="mb-1 block">{ar ? 'العام الأكاديمي' : 'Academic year'}</span>
        <select value={year} onChange={event => setYear(event.target.value)} className="h-10 w-full min-w-44 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 sm:w-auto">
          <option value="">{ar ? 'كل الأعوام' : 'All years'}</option>
          {options.data?.academic_years.map(item => <option key={item.id} value={item.code}>{item.code}{item.is_current ? (ar ? ' — الحالي' : ' — Current') : ''}</option>)}
        </select>
      </label>
    </PageHeader>

    {hasAttention && <section aria-label={ar ? 'ما يحتاج متابعة' : 'Needs follow-up'} className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-black text-slate-900"><AlertTriangle className="h-4 w-4 text-amber-600" />{ar ? 'ما يحتاج متابعة' : 'Needs follow-up'}</h2>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {attention.overdue_plans.slice(0, 3).map(plan => <Link key={plan.id} to="/quality/improvement" className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-amber-50 px-3 py-3 text-xs hover:bg-amber-100"><span className="min-w-0"><strong className="block truncate text-slate-800">{plan.observation}</strong><span className="mt-1 block text-amber-800">{ar ? 'خطة متأخرة' : 'Overdue plan'}{plan.due_date ? ` · ${dateOnly(plan.due_date)}` : ''}</span></span><ArrowLeft className="h-4 w-4 shrink-0 text-amber-700" /></Link>)}
        {attention.pending_measurements.slice(0, 3).map(item => <Link key={item.id} to="/quality/kpis" className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-blue-50 px-3 py-3 text-xs hover:bg-blue-100"><span className="min-w-0"><strong className="block truncate text-slate-800">{item.kpi?.name || item.kpi?.code || (ar ? 'قياس مؤشر' : 'Indicator measurement')}</strong><span className="mt-1 block text-blue-800">{ar ? 'بانتظار المراجعة' : 'Pending review'}</span></span><ArrowLeft className="h-4 w-4 shrink-0 text-blue-700" /></Link>)}
        {counts.evidence_expired > 0 && <Link to="/quality/operations?tab=evidence&filter=expired" className="flex items-center justify-between gap-3 rounded-xl bg-red-50 px-3 py-3 text-xs font-bold text-red-800 hover:bg-red-100"><span>{counts.evidence_expired} {ar ? 'أدلة انتهت صلاحيتها' : 'evidence records expired'}</span><ArrowLeft className="h-4 w-4 shrink-0" /></Link>}
        {counts.evidence_expiring > 0 && <Link to="/quality/operations?tab=evidence&filter=upcoming" className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-3 text-xs font-bold text-slate-700 hover:bg-slate-100"><span>{counts.evidence_expiring} {ar ? 'أدلة تقترب من انتهاء الصلاحية' : 'evidence records nearing expiry'}</span><ArrowLeft className="h-4 w-4 shrink-0" /></Link>}
      </div>
    </section>}

    <section aria-label={ar ? 'أقسام الجودة' : 'Quality areas'} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-black text-slate-900 sm:px-5">{ar ? 'أقسام الجودة' : 'Quality areas'}</h2>
      <div className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4">
        {sections.map(({ to, icon: Icon, title, count, suffix }) => <Link key={to} to={to} className="group flex items-center gap-3 p-4 transition hover:bg-teal-50 sm:border-e sm:border-slate-100 sm:p-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700"><Icon className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><strong className="block text-sm text-slate-900">{title}</strong><span className="mt-0.5 block text-xs text-slate-500">{count} {suffix}</span></span>
          <ArrowLeft className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-teal-700" />
        </Link>)}
      </div>
    </section>

    <div className="grid gap-4 lg:grid-cols-2">
      <section aria-label={ar ? 'الخطط الأخيرة' : 'Recent plans'} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-black text-slate-900">{ar ? 'الخطط الأخيرة' : 'Recent plans'}</h2><Link to="/quality/improvement" className="text-xs font-bold text-teal-700">{ar ? 'عرض الكل' : 'View all'}</Link></div>
        <div className="mt-2 divide-y divide-slate-100">{plans.length ? plans.slice(0, 4).map(plan => <div key={plan.id} className="py-3"><p className="text-sm font-bold leading-5 text-slate-800">{plan.observation}</p><p className="mt-1 text-xs text-slate-500">{planStatus[plan.status]?.[ar ? 0 : 1] || plan.status}{plan.responsible ? ` · ${plan.responsible}` : ''}{plan.due_date ? ` · ${dateOnly(plan.due_date)}` : ''}</p></div>) : <p className="py-5 text-xs text-slate-500">{ar ? 'لا توجد خطط بعد.' : 'No plans yet.'}</p>}</div>
      </section>
      <section aria-label={ar ? 'آخر القياسات والاستبيانات' : 'Recent measures and surveys'} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-sm font-black text-slate-900">{ar ? 'آخر القياسات والاستبيانات' : 'Recent measures and surveys'}</h2>
        <div className="mt-2 divide-y divide-slate-100">
          {kpis.slice(0, 3).map(kpi => <Link key={kpi.id} to="/quality/kpis" className="flex min-w-0 items-center justify-between gap-3 py-3 text-xs hover:text-teal-700"><span className="min-w-0 truncate font-bold text-slate-800">{kpi.code} · {kpi.name}</span><span className="shrink-0 text-slate-500">{kpi.latest_measurement?.display_value || (ar ? 'غير مقاس' : 'Not measured')}</span></Link>)}
          {surveys.slice(0, 2).map(survey => <Link key={survey.id} to={`/quality/surveys/${survey.id}`} className="flex min-w-0 items-center justify-between gap-3 py-3 text-xs hover:text-teal-700"><span className="min-w-0 truncate font-bold text-slate-800">{survey.title}</span><span className="shrink-0 text-slate-500">{survey.submissions_count ?? survey.responses_count ?? 0} {ar ? 'رد' : 'responses'}</span></Link>)}
          {!kpis.length && !surveys.length && <p className="py-5 text-xs text-slate-500">{ar ? 'لا توجد قياسات أو استبيانات بعد.' : 'No measures or surveys yet.'}</p>}
        </div>
      </section>
    </div>
  </div>;
}
