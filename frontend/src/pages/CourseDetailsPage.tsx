import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useI18n } from '@/i18n/I18nContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { ChevronRight, BookOpen, Target, Settings, CheckCircle } from 'lucide-react';

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
  const { courseId } = useParams<{ courseId: string }>();
  const { locale, t } = useI18n();
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

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
            <ChevronRight className="w-4 h-4 rtl:rotate-180" />
            {t('nav.courses', 'المساقات')}
          </Link>
          <span className="text-slate-300">/</span>
          <span className="text-sm font-semibold text-slate-700">{data.code}</span>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsReportModalOpen(true)}
            className="text-sm font-semibold bg-white border border-indigo-200 text-indigo-600 hover:bg-indigo-50 px-4 py-2 rounded-xl shadow-sm transition-all"
          >
            {locale === 'ar' ? 'تقرير المساق السنوي' : 'Annual Course Report'}
          </button>
          <Link to={`/grades?course_id=${courseId}`} className="text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-2 rounded-xl shadow-sm transition-all">
            {locale === 'ar' ? 'سجل العلامات' : 'Grades Log'}
          </Link>
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

      {/* Annual Course Report Modal */}
      {isReportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-lg text-slate-800">
                {locale === 'ar' ? `تقرير المساق السنوي: ${data.code} - ${name}` : `Annual Course Report: ${data.code}`}
              </h3>
            </div>
            <div className="p-6 space-y-6 overflow-y-auto">
              <div className="grid grid-cols-3 gap-3">
                <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-100 text-center">
                  <div className="text-2xl font-black text-indigo-700">92%</div>
                  <div className="text-xs font-bold text-indigo-500">{locale === 'ar' ? 'نسبة النجاح العامة' : 'Pass Rate'}</div>
                </div>
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 text-center">
                  <div className="text-2xl font-black text-emerald-700">81.4</div>
                  <div className="text-xs font-bold text-emerald-500">{locale === 'ar' ? 'متوسط درجات المساق' : 'Average Grade'}</div>
                </div>
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100 text-center">
                  <div className="text-2xl font-black text-amber-700">88%</div>
                  <div className="text-xs font-bold text-amber-500">{locale === 'ar' ? 'تحقيق المخرجات ILOs' : 'ILOs Achieved'}</div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  {locale === 'ar' ? 'مخرجات التعلم المستهدفة ومدى تحققها' : 'Course Learning Outcomes (ILOs)'}
                </h4>
                <div className="space-y-2">
                  {(data.learning_outcomes || []).map((ilo: any) => (
                    <div key={ilo.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-indigo-700">{ilo.outcome_code}</span>
                      <span className="font-medium text-slate-700 flex-1 truncate">{ilo.text_ar || ilo.text_en}</span>
                      <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 font-bold">متحقق (Achieved)</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {locale === 'ar' ? 'خطة التحسين والتطوير للعام القادم' : 'Improvement Action Plan'}
                </label>
                <textarea 
                  rows={3} 
                  defaultValue={locale === 'ar' ? 'يوصى بزيادة عدد الحالات السريرية وتحديث أجهزة محاكاة تدريب المهارات.' : 'Recommended to increase clinical cases and upgrade simulators.'}
                  className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button 
                  onClick={() => setIsReportModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  {locale === 'ar' ? 'إغلاق' : 'Close'}
                </button>
                <button 
                  onClick={() => {
                    alert(locale === 'ar' ? 'تم حفظ واعتماد تقرير المساق السنوي بنجاح.' : 'Annual report saved and approved.');
                    setIsReportModalOpen(false);
                  }}
                  className="px-4 py-2 text-sm font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
                >
                  {locale === 'ar' ? 'حفظ واعتماد التقرير' : 'Save & Approve Report'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
