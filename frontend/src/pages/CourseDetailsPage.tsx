import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useI18n } from '@/i18n/I18nContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Card, CardContent } from '@/components/ui/Card';
import { ChevronRight, BookOpen, Target, Settings, GraduationCap, CheckCircle } from 'lucide-react';

type Course = {
  id: number;
  code: string;
  name_ar: string;
  name_en?: string | null;
  credit_hours: number;
  assessment_components?: Array<{ id: number; name: string; weight?: number | null; max_score?: number | null }>;
  learning_outcomes?: Array<{ id: number; outcome_code: string; text_ar?: string | null; text_en?: string | null; domain?: string | null; program_outcome?: string | null }>;
  program_outcome_mappings?: Array<{ id: number; program_outcome_code: string; mapping_level?: string | null }>;
};

export function CourseDetailsPage() {
  const navigate = useNavigate();
  const { courseId } = useParams<{ courseId: string }>();
  const { locale, t } = useI18n();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['course', courseId],
    queryFn: () => apiFetch<Course>(`/courses/${courseId}`),
    enabled: Boolean(courseId)
  });

  if (isLoading) return <LoadingState />;
  if (isError || !data) return <ErrorState onRetry={() => refetch()} />;

  const name = locale === 'ar' ? data.name_ar : data.name_en || data.name_ar;

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 pb-12">
      {/* Breadcrumbs & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-2">
          <Link to="/courses" className="flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 transition-colors bg-white px-3 py-1.5 rounded-xl border border-slate-100 shadow-sm">
            <ChevronRight className="w-4 h-4" />
            {t('nav.courses', 'المساقات')}
          </Link>
          <span className="text-slate-300">/</span>
          <span className="text-sm font-semibold text-slate-700">{data.code}</span>
        </div>
        
        <div className="flex items-center gap-2">
           <Link to={`/grades?course_id=${courseId}`} className="text-sm font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-xl shadow-sm transition-all">
             {locale === 'ar' ? 'سجل العلامات' : 'Grades Log'}
           </Link>
           <button className="text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-2 rounded-xl shadow-sm transition-all">
             {locale === 'ar' ? 'تعديل المساق' : 'Edit Course'}
           </button>
        </div>
      </div>

      {/* Profile Header */}
      <div className="rounded-3xl border border-slate-100 bg-white overflow-hidden shadow-sm relative">
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-r from-indigo-500 to-purple-600"></div>
        <div className="relative px-8 pb-8 pt-16 flex flex-col sm:flex-row gap-6 items-end sm:items-center">
          <div className="w-24 h-24 rounded-2xl bg-white shadow-md flex items-center justify-center p-2 border-4 border-white shrink-0">
            <div className="w-full h-full rounded-xl bg-indigo-50 flex items-center justify-center">
              <BookOpen className="w-10 h-10 text-indigo-600" />
            </div>
          </div>
          <div className="flex-1 min-w-0 pb-2">
            <h1 className="text-2xl font-bold text-slate-900 truncate">{name}</h1>
            <p className="text-slate-500 font-medium text-sm mt-1">{data.code}</p>
          </div>
          <div className="flex flex-wrap gap-2 pb-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold text-sm border border-emerald-100">
              {data.credit_hours} {locale === 'ar' ? 'ساعات معتمدة' : 'Credits'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Content (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 px-6 py-4 bg-slate-50/50 flex items-center gap-2">
              <Target className="w-5 h-5 text-indigo-500" />
              <h2 className="font-bold text-slate-800">{t('courseDetails.outcomes', 'مخرجات التعلم (ILOs)')}</h2>
            </div>
            <div className="p-6">
              {!data.learning_outcomes?.length ? (
                <EmptyState message={t('courseDetails.none', 'لا توجد بيانات')} />
              ) : (
                <div className="grid gap-3">
                  {data.learning_outcomes.map(item => (
                    <div key={item.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded text-xs">{item.outcome_code}</span>
                        <span className="text-xs font-semibold text-slate-500 px-2 py-0.5 rounded-full border border-slate-200 bg-white">
                          {item.domain || (locale === 'ar' ? 'عام' : 'General')}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-slate-700 leading-relaxed">
                        {locale === 'ar' ? item.text_ar || item.text_en : item.text_en || item.text_ar || '—'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 px-6 py-4 bg-slate-50/50 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-indigo-500" />
              <h2 className="font-bold text-slate-800">{t('courseDetails.plo', 'ارتباط المخرجات (PLOs)')}</h2>
            </div>
            <div className="p-6">
              {!data.program_outcome_mappings?.length ? (
                <EmptyState message={t('courseDetails.none', 'لا توجد بيانات')} />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {data.program_outcome_mappings.map(item => (
                    <div key={item.id} className="flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="font-bold text-slate-700">{item.program_outcome_code}</span>
                      <span className="text-slate-300">|</span>
                      <span className="text-sm font-medium text-slate-500">{item.mapping_level || '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar (1/3 width) */}
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 px-6 py-4 bg-slate-50/50 flex items-center gap-2">
              <Settings className="w-5 h-5 text-indigo-500" />
              <h2 className="font-bold text-slate-800">{t('courseDetails.components', 'مكونات التقييم')}</h2>
            </div>
            <div className="p-6">
              {!data.assessment_components?.length ? (
                <EmptyState message={t('courseDetails.none', 'لا توجد بيانات')} />
              ) : (
                <div className="space-y-3">
                  {data.assessment_components.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <div>
                        <span className="block font-bold text-slate-700 text-sm mb-1">{item.name}</span>
                        <span className="block text-xs font-semibold text-slate-400">{locale === 'ar' ? 'العلامة القصوى' : 'Max'}: {item.max_score ?? '—'}</span>
                      </div>
                      <div className="flex items-center justify-center w-12 h-12 bg-white rounded-lg border border-slate-100 shadow-sm shrink-0">
                        <span className="font-bold text-indigo-600 text-sm">{item.weight ?? '—'}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}
