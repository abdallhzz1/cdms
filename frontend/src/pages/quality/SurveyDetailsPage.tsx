import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ExternalLink, BarChart3, MessageSquare, TrendingUp } from 'lucide-react';

export function SurveyDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useI18n();

  const { data: survey, isLoading, isError } = useQuery({
    queryKey: ['quality-survey', id],
    queryFn: () => apiFetch<any>(`/quality-surveys/${id}`),
  });

  const { data: responses } = useQuery({
    queryKey: ['quality-survey-responses', id],
    queryFn: () => apiFetch<any>(`/quality-surveys/${id}/responses`),
  });

  if (isLoading) return <LoadingState />;
  if (isError || !survey) return <ErrorState />;

  const s = Array.isArray(survey) ? survey[0] : survey?.data ?? survey;
  const questions: any[] = s?.questions ?? [];
  const summary: any[] = responses?.summary ?? responses?.data?.summary ?? [];

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 pb-12">
      <PageHeader
        title={s.title}
        description={`${s.code} · ${s.target_group}${s.frequency ? ` · ${s.frequency}` : ''}`}
      >
        {s.form_url && (
          <a href={s.form_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-colors">
            <ExternalLink className="w-4 h-4" />
            {locale === 'ar' ? 'فتح الاستبيان' : 'Open Survey Form'}
          </a>
        )}
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-indigo-50 rounded-3xl p-5 flex items-center gap-4">
          <MessageSquare className="w-7 h-7 text-indigo-600" />
          <div>
            <div className="text-2xl font-black text-indigo-700">{questions.length}</div>
            <div className="text-xs font-semibold text-indigo-500">{locale === 'ar' ? 'الأسئلة' : 'Questions'}</div>
          </div>
        </div>
        <div className="bg-emerald-50 rounded-3xl p-5 flex items-center gap-4">
          <BarChart3 className="w-7 h-7 text-emerald-600" />
          <div>
            <div className="text-2xl font-black text-emerald-700">{summary.length}</div>
            <div className="text-xs font-semibold text-emerald-500">{locale === 'ar' ? 'أسئلة لها إجابات' : 'Questions With Responses'}</div>
          </div>
        </div>
        <div className="bg-amber-50 rounded-3xl p-5 flex items-center gap-4">
          <TrendingUp className="w-7 h-7 text-amber-600" />
          <div>
            <div className="text-2xl font-black text-amber-700">
              {summary.length ? (summary.reduce((acc: number, q: any) => acc + (q.numeric_average ?? 0), 0) / summary.filter((q: any) => q.numeric_average != null).length || 0).toFixed(1) : '—'}
            </div>
            <div className="text-xs font-semibold text-amber-500">{locale === 'ar' ? 'متوسط التقييم' : 'Average Rating'}</div>
          </div>
        </div>
      </div>

      {/* Questions List */}
      {questions.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-bold text-slate-800">{locale === 'ar' ? 'أسئلة الاستبيان' : 'Survey Questions'}</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {questions.map((q: any, i: number) => {
              const qSummary = summary.find((s: any) => s.question_id === q.id);
              return (
                <div key={q.id} className="px-6 py-4 flex items-start gap-4">
                  <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-500 text-sm font-black flex items-center justify-center shrink-0">{i + 1}</div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-800">{q.question_text}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-slate-400">{q.question_type}</span>
                      {q.is_required && <span className="text-xs text-red-500 font-semibold">{locale === 'ar' ? 'مطلوب' : 'Required'}</span>}
                      {q.weight && <span className="text-xs text-slate-400">{locale === 'ar' ? 'الوزن' : 'Weight'}: {q.weight}</span>}
                    </div>
                  </div>
                  {qSummary && (
                    <div className="text-right shrink-0">
                      <div className="text-sm font-black text-indigo-600">{qSummary.response_count} {locale === 'ar' ? 'إجابة' : 'resp.'}</div>
                      {qSummary.numeric_average != null && (
                        <div className="text-xs text-slate-400">{locale === 'ar' ? 'معدل' : 'avg'}: {Number(qSummary.numeric_average).toFixed(1)}</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Purpose / Notes */}
      {(s.purpose || s.notes) && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4">
          {s.purpose && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">{locale === 'ar' ? 'الغرض' : 'Purpose'}</h3>
              <p className="text-sm text-slate-700">{s.purpose}</p>
            </div>
          )}
          {s.notes && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">{locale === 'ar' ? 'ملاحظات' : 'Notes'}</h3>
              <p className="text-sm text-slate-700">{s.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
