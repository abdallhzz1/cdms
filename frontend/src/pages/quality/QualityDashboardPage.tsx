import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, BarChart3, CheckCircle2, ClipboardCheck, LineChart, RefreshCw, Target } from 'lucide-react';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';

type Plan = { id: number; observation: string; improvement_action: string; responsible?: string; due_date?: string; status: string; priority: string };
type Survey = { id: number; code: string; title: string; target_group: string; questions_count: number; responses_count: number };
type Kpi = { id: number; code: string; name: string; target_value?: string; latest_measurement?: { display_value: string; achievement_status: string; measured_at: string } | null };
type Overview = {
  counts: { surveys: number; survey_responses: number; kpis: number; kpis_achieved: number; plans_open: number; plans_overdue: number; plans_closed: number };
  recent_surveys: Survey[]; recent_plans: Plan[]; recent_kpis: Kpi[];
};

const planStatus: Record<string, string> = { open: 'مفتوحة', in_progress: 'قيد التنفيذ', under_review: 'قيد التحقق', closed: 'مغلقة' };

export function QualityDashboardPage() {
  const { can } = useAuth();
  const { locale } = useI18n();
  const query = useQuery({ queryKey: ['quality-overview'], queryFn: () => apiFetch<Overview>('/quality-overview') });

  if (!can('quality.view')) return <ErrorState title={locale === 'ar' ? 'غير مصرح' : 'Access denied'} />;
  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) return <ErrorState title={locale === 'ar' ? 'تعذر تحميل مركز الجودة' : 'Unable to load quality center'} onRetry={() => query.refetch()} />;

  const { counts, recent_plans: plans, recent_surveys: surveys, recent_kpis: kpis } = query.data;
  const completionTotal = counts.plans_open + counts.plans_closed;
  const closureRate = completionTotal ? Math.round((counts.plans_closed / completionTotal) * 100) : 0;
  const achievementRate = counts.kpis ? Math.round((counts.kpis_achieved / counts.kpis) * 100) : 0;
  const isAr = locale === 'ar';

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-14">
      <PageHeader title={isAr ? 'مركز ضمان الجودة والتطوير' : 'Quality Assurance & Development Center'} description={isAr ? 'مساحة عمل موحدة للقياس، رصد فرص التحسين، متابعة التنفيذ، وتوثيق الإغلاق.' : 'One workspace for measurement, improvement opportunities, implementation, and verified closure.'} />

      <section className="overflow-hidden rounded-3xl border border-teal-100 bg-white shadow-sm">
        <div className="grid lg:grid-cols-[1.2fr_1fr]">
          <div className="p-5 sm:p-7">
            <div className="flex items-center gap-2 text-teal-700"><RefreshCw className="h-5 w-5" /><h2 className="font-black">{isAr ? 'دورة التحسين المستمر' : 'Continuous improvement cycle'}</h2></div>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">{isAr ? 'كل ملاحظة يجب أن تبدأ بدليل أو قياس، تتحول إلى إجراء مسؤول ومؤقت، ثم تُراجع وتُغلق بدليل تحقق.' : 'Every observation begins with evidence, becomes an owned and dated action, then is reviewed and closed with verification.'}</p>
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ['01', isAr ? 'قياس' : 'Measure'], ['02', isAr ? 'تحليل' : 'Analyze'],
                ['03', isAr ? 'تحسين' : 'Improve'], ['04', isAr ? 'تحقق' : 'Verify'],
              ].map(([number, label]) => <div key={number} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3"><span className="text-[10px] font-black text-teal-600">{number}</span><p className="mt-1 text-xs font-black text-slate-700">{label}</p></div>)}
            </div>
          </div>
          <div className="border-t border-teal-100 bg-teal-50/60 p-5 sm:p-7 lg:border-r lg:border-t-0">
            <p className="text-xs font-black text-teal-800">{isAr ? 'حالة العمل الحالية' : 'Current operating status'}</p>
            <div className="mt-4 grid grid-cols-3 divide-x divide-x-reverse divide-teal-100 text-center">
              <div><p className="text-2xl font-black text-slate-800">{counts.plans_open}</p><p className="mt-1 text-[11px] text-slate-500">{isAr ? 'خطة نشطة' : 'Active plans'}</p></div>
              <div><p className="text-2xl font-black text-slate-800">{closureRate}%</p><p className="mt-1 text-[11px] text-slate-500">{isAr ? 'نسبة الإغلاق' : 'Closure rate'}</p></div>
              <div><p className="text-2xl font-black text-slate-800">{achievementRate}%</p><p className="mt-1 text-[11px] text-slate-500">{isAr ? 'تحقق المؤشرات' : 'KPI achievement'}</p></div>
            </div>
            {counts.plans_overdue > 0 && <Link to="/quality/improvement" className="mt-5 flex items-center justify-between rounded-2xl border border-amber-200 bg-white px-4 py-3 text-xs font-bold text-amber-800"><span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{counts.plans_overdue} {isAr ? 'خطط تجاوزت الموعد وتحتاج متابعة' : 'overdue plans need attention'}</span><ArrowLeft className="h-4 w-4" /></Link>}
          </div>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        {[
          { to: '/quality/surveys', icon: ClipboardCheck, title: isAr ? 'القياس والاستبيانات' : 'Measurement & surveys', value: counts.surveys, hint: `${counts.survey_responses} ${isAr ? 'إجابة موثقة' : 'recorded responses'}` },
          { to: '/quality/kpis', icon: LineChart, title: isAr ? 'مؤشرات الجودة' : 'Quality indicators', value: counts.kpis, hint: `${counts.kpis_achieved} ${isAr ? 'مؤشرات متحققة' : 'indicators achieved'}` },
          { to: '/quality/improvement', icon: Target, title: isAr ? 'خطط التحسين' : 'Improvement plans', value: counts.plans_open, hint: `${counts.plans_closed} ${isAr ? 'خطط مغلقة بدليل' : 'plans closed with evidence'}` },
        ].map(({ to, icon: Icon, title, value, hint }) => <Link key={to} to={to} className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-200"><div className="flex items-center justify-between"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-50 text-teal-700"><Icon className="h-5 w-5" /></span><ArrowLeft className="h-4 w-4 text-slate-300 transition group-hover:text-teal-600" /></div><div className="mt-4 flex items-end justify-between gap-3"><div><h3 className="text-sm font-black text-slate-800">{title}</h3><p className="mt-1 text-xs text-slate-500">{hint}</p></div><span className="text-2xl font-black text-teal-700">{value}</span></div></Link>)}
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <header className="flex items-center justify-between"><div><h2 className="font-black text-slate-800">{isAr ? 'متابعة خطط التحسين' : 'Improvement follow-up'}</h2><p className="mt-1 text-xs text-slate-500">{isAr ? 'الأحدث تعديلًا والأقرب للمتابعة' : 'Recently updated plans'}</p></div><Link to="/quality/improvement" className="text-xs font-black text-teal-700">{isAr ? 'إدارة الخطط' : 'Manage plans'}</Link></header>
          <div className="mt-4 divide-y divide-slate-100">
            {plans.length ? plans.map(plan => <div key={plan.id} className="py-3 first:pt-0"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="line-clamp-1 text-sm font-bold text-slate-800">{plan.observation}</p><p className="mt-1 line-clamp-1 text-xs text-slate-500">{plan.improvement_action}</p></div><span className="shrink-0 rounded-lg bg-teal-50 px-2 py-1 text-[10px] font-black text-teal-700">{planStatus[plan.status] || plan.status}</span></div><div className="mt-2 flex gap-3 text-[10px] text-slate-400"><span>{plan.responsible || (isAr ? 'غير مسندة' : 'Unassigned')}</span><span>{plan.due_date || '—'}</span></div></div>) : <p className="py-10 text-center text-sm text-slate-400">{isAr ? 'لا توجد خطط تحسين بعد.' : 'No improvement plans yet.'}</p>}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <header className="flex items-center justify-between"><div><h2 className="font-black text-slate-800">{isAr ? 'آخر نتائج القياس' : 'Latest measurement results'}</h2><p className="mt-1 text-xs text-slate-500">{isAr ? 'المؤشرات والاستبيانات الموثقة' : 'Documented KPIs and surveys'}</p></div><BarChart3 className="h-5 w-5 text-teal-600" /></header>
          <div className="mt-4 space-y-2">
            {kpis.slice(0, 4).map(kpi => <Link to="/quality/kpis" key={kpi.id} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3"><div className="min-w-0"><p className="truncate text-xs font-black text-slate-700">{kpi.code} · {kpi.name}</p><p className="mt-1 text-[10px] text-slate-400">{isAr ? 'المستهدف' : 'Target'}: {kpi.target_value || '—'}</p></div><span className="mr-3 shrink-0 text-xs font-black text-teal-700">{kpi.latest_measurement?.display_value || (isAr ? 'غير مقاس' : 'Not measured')}</span></Link>)}
            {surveys.slice(0, 2).map(survey => <Link to={`/quality/surveys/${survey.id}`} key={survey.id} className="flex items-center justify-between rounded-2xl border border-slate-100 p-3"><div className="min-w-0"><p className="truncate text-xs font-black text-slate-700">{survey.title}</p><p className="mt-1 text-[10px] text-slate-400">{survey.target_group} · {survey.questions_count} {isAr ? 'سؤال' : 'questions'}</p></div><span className="flex shrink-0 items-center gap-1 text-xs font-black text-teal-700"><CheckCircle2 className="h-3.5 w-3.5" />{survey.responses_count}</span></Link>)}
            {!kpis.length && !surveys.length && <p className="py-10 text-center text-sm text-slate-400">{isAr ? 'ابدأ بتعريف مؤشر أو استبيان.' : 'Start by defining an indicator or survey.'}</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
