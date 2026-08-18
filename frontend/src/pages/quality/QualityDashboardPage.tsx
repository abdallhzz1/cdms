import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ClipboardCheck, TrendingUp, BarChart3, AlertTriangle, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export function QualityDashboardPage() {
  const { can } = useAuth();
  const { locale } = useI18n();

  const { data: surveys, isLoading: sl } = useQuery({
    queryKey: ['quality-surveys-count'],
    queryFn: () => apiFetch<any>('/quality-surveys?per_page=5'),
  });

  const { data: plans, isLoading: pl } = useQuery({
    queryKey: ['quality-plans-count'],
    queryFn: () => apiFetch<any>('/quality-improvement-plans?per_page=5'),
  });

  const { data: kpis, isLoading: kl } = useQuery({
    queryKey: ['quality-kpis-count'],
    queryFn: () => apiFetch<any>('/quality-kpis?per_page=5'),
  });

  if (!can('quality.view')) return <ErrorState title="Access Denied" />;
  if (sl || pl || kl) return <LoadingState />;

  const surveysList = Array.isArray(surveys) ? surveys : surveys?.items || [];
  const plansList = Array.isArray(plans) ? plans : plans?.items || [];
  const kpisList = Array.isArray(kpis) ? kpis : kpis?.items || [];
  const surveysMeta = surveys?.pagination ?? {};
  const plansMeta = plans?.pagination ?? {};
  const kpisMeta = kpis?.pagination ?? {};

  const overduePlans = plansList.filter((p: any) => p.due_date && new Date(p.due_date) < new Date() && p.status !== 'closed');

  const CARDS = [
    { label_ar: 'الاستبيانات', label_en: 'Surveys', count: surveysMeta.total ?? surveysList.length, icon: ClipboardCheck, bg: 'bg-indigo-50', text: 'text-indigo-600', link: '/quality/surveys' },
    { label_ar: 'خطط التحسين', label_en: 'Improvement Plans', count: plansMeta.total ?? plansList.length, icon: TrendingUp, bg: 'bg-emerald-50', text: 'text-emerald-600', link: '/quality/improvement' },
    { label_ar: 'مؤشرات الجودة (KPIs)', label_en: 'Quality KPIs', count: kpisMeta.total ?? kpisList.length, icon: BarChart3, bg: 'bg-blue-50', text: 'text-blue-600', link: '/quality/kpis' },
    { label_ar: 'خطط متأخرة', label_en: 'Overdue Plans', count: overduePlans.length, icon: AlertTriangle, bg: 'bg-red-50', text: 'text-red-600', link: '/quality/improvement' },
  ];

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 pb-12">
      <PageHeader
        title={locale === 'ar' ? 'لوحة تحكم الجودة' : 'Quality Dashboard'}
        description={locale === 'ar' ? 'نظرة شاملة على منظومة الجودة والتحسين المستمر' : 'Comprehensive view of quality assurance and continuous improvement'}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {CARDS.map((c, i) => {
          const Icon = c.icon;
          return (
            <Link key={i} to={c.link} className={`${c.bg} rounded-3xl p-5 flex items-center gap-4 hover:shadow-md transition-all`}>
              <div className={`w-12 h-12 bg-white rounded-2xl flex items-center justify-center ${c.text} shrink-0 shadow-sm`}>
                <Icon className="w-6 h-6" />
              </div>
              <div>
                <div className={`text-3xl font-black ${c.text}`}>{c.count}</div>
                <div className={`text-xs font-semibold ${c.text} opacity-70`}>{locale === 'ar' ? c.label_ar : c.label_en}</div>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Surveys */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-slate-800">{locale === 'ar' ? 'آخر الاستبيانات' : 'Recent Surveys'}</h2>
            <Link to="/quality/surveys" className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1">
              {locale === 'ar' ? 'عرض الكل' : 'View All'} <ChevronRight className="w-3 h-3 rtl:rotate-180" />
            </Link>
          </div>
          <div className="space-y-3">
            {surveysList.map((s: any) => (
              <Link to={`/quality/surveys/${s.id}`} key={s.id} className="flex items-center gap-3 p-3 rounded-2xl hover:bg-slate-50 transition-colors">
                <div className="w-8 h-8 bg-indigo-100 text-indigo-700 rounded-xl flex items-center justify-center text-xs font-black shrink-0">
                  {s.questions_count ?? 0}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-800 truncate">{s.title}</div>
                  <div className="text-xs text-slate-400">{s.code} · {s.target_group}</div>
                </div>
                {s.is_mandatory && (
                  <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 font-bold rounded-lg shrink-0">{locale === 'ar' ? 'إلزامي' : 'Mandatory'}</span>
                )}
              </Link>
            ))}
            {!surveysList.length && <p className="text-sm text-slate-400 text-center py-4">{locale === 'ar' ? 'لا توجد استبيانات' : 'No surveys'}</p>}
          </div>
        </div>

        {/* Recent Plans */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-slate-800">{locale === 'ar' ? 'خطط التحسين الأخيرة' : 'Recent Improvement Plans'}</h2>
            <Link to="/quality/improvement" className="text-xs font-bold text-emerald-600 hover:underline flex items-center gap-1">
              {locale === 'ar' ? 'عرض الكل' : 'View All'} <ChevronRight className="w-3 h-3 rtl:rotate-180" />
            </Link>
          </div>
          <div className="space-y-3">
            {plansList.map((p: any) => {
              const isOverdue = p.due_date && new Date(p.due_date) < new Date() && p.status !== 'closed';
              return (
                <div key={p.id} className={`p-3 rounded-2xl border ${isOverdue ? 'border-red-200 bg-red-50/30' : 'border-slate-100'}`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${
                      p.priority === 'high' ? 'bg-red-100 text-red-700' :
                      p.priority === 'normal' ? 'bg-amber-100 text-amber-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>{p.priority}</span>
                    {p.due_date && <span className={`text-xs ${isOverdue ? 'text-red-600 font-bold' : 'text-slate-400'}`}>{p.due_date}</span>}
                  </div>
                  <div className="text-sm font-semibold text-slate-800 line-clamp-2">{p.observation}</div>
                </div>
              );
            })}
            {!plansList.length && <p className="text-sm text-slate-400 text-center py-4">{locale === 'ar' ? 'لا توجد خطط' : 'No plans'}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
