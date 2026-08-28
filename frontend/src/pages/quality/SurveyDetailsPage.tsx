import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ExternalLink, BarChart3, MessageSquare, TrendingUp } from 'lucide-react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100';

export function SurveyDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useI18n();
  const { can } = useAuth();
  const client = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [question, setQuestion] = useState({ version: '1', question_number: '', question_text: '', question_type: 'rating', options: '', is_required: true, weight: '', axis: '', active_from: '', active_until: '' });

  const { data: survey, isLoading, isError } = useQuery({
    queryKey: ['quality-survey', id],
    queryFn: () => apiFetch<any>(`/quality-surveys/${id}`),
  });

  const { data: responses } = useQuery({
    queryKey: ['quality-survey-responses', id],
    queryFn: () => apiFetch<any>(`/quality-surveys/${id}/responses`),
  });
  const addQuestion = useMutation({ mutationFn: () => apiFetch(`/quality-surveys/${id}/questions`, { method: 'POST', body: { ...question, question_number: Number(question.question_number), weight: question.weight ? Number(question.weight) : null, options: question.options || null, axis: question.axis || null, active_from: question.active_from || null, active_until: question.active_until || null } }), onSuccess: async () => { await client.invalidateQueries({ queryKey: ['quality-survey', id] }); setAdding(false); setQuestion({ version: '1', question_number: '', question_text: '', question_type: 'rating', options: '', is_required: true, weight: '', axis: '', active_from: '', active_until: '' }); } });

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
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-bold rounded-xl hover:bg-teal-700 transition-colors">
            <ExternalLink className="w-4 h-4" />
            {locale === 'ar' ? 'فتح الاستبيان' : 'Open Survey Form'}
          </a>
        )}
        {can('quality.manage') && <Button variant="outline" onClick={() => { setQuestion(current => ({ ...current, question_number: String(questions.length + 1) })); setAdding(true); }}><Plus className="ml-1 h-4 w-4" />{locale === 'ar' ? 'إضافة سؤال' : 'Add question'}</Button>}
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-teal-50 rounded-3xl p-5 flex items-center gap-4">
          <MessageSquare className="w-7 h-7 text-teal-600" />
          <div>
            <div className="text-2xl font-black text-teal-700">{questions.length}</div>
            <div className="text-xs font-semibold text-teal-600">{locale === 'ar' ? 'الأسئلة' : 'Questions'}</div>
          </div>
        </div>
        <div className="bg-teal-50 rounded-3xl p-5 flex items-center gap-4">
          <BarChart3 className="w-7 h-7 text-teal-600" />
          <div>
            <div className="text-2xl font-black text-teal-700">{summary.length}</div>
            <div className="text-xs font-semibold text-teal-600">{locale === 'ar' ? 'أسئلة لها إجابات' : 'Questions With Responses'}</div>
          </div>
        </div>
        <div className="bg-teal-50 rounded-3xl p-5 flex items-center gap-4">
          <TrendingUp className="w-7 h-7 text-teal-600" />
          <div>
            <div className="text-2xl font-black text-teal-700">
              {summary.filter((q: any) => q.numeric_average != null).length ? (summary.reduce((acc: number, q: any) => acc + Number(q.numeric_average ?? 0), 0) / summary.filter((q: any) => q.numeric_average != null).length).toFixed(1) : '—'}
            </div>
            <div className="text-xs font-semibold text-teal-600">{locale === 'ar' ? 'متوسط التقييم' : 'Average Rating'}</div>
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
                      <div className="text-sm font-black text-teal-700">{qSummary.response_count} {locale === 'ar' ? 'إجابة' : 'resp.'}</div>
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
      <Modal isOpen={adding} onClose={() => setAdding(false)} title={locale === 'ar' ? 'إضافة سؤال إلى بنك الاستبيان' : 'Add survey question'} maxWidth="2xl"><form onSubmit={(e:FormEvent) => { e.preventDefault(); addQuestion.mutate(); }} className="space-y-4"><div className="grid gap-3 sm:grid-cols-3"><label><span className="mb-1 block text-xs font-bold">{locale === 'ar' ? 'رقم السؤال' : 'Question number'}</span><input required type="number" min="1" value={question.question_number} onChange={e => setQuestion({...question, question_number:e.target.value})} className={inputClass} /></label><label><span className="mb-1 block text-xs font-bold">{locale === 'ar' ? 'الإصدار' : 'Version'}</span><input required value={question.version} onChange={e => setQuestion({...question, version:e.target.value})} className={inputClass} /></label><label><span className="mb-1 block text-xs font-bold">{locale === 'ar' ? 'نوع الإجابة' : 'Answer type'}</span><select value={question.question_type} onChange={e => setQuestion({...question, question_type:e.target.value})} className={inputClass}><option value="rating">{locale === 'ar' ? 'مقياس رقمي' : 'Rating'}</option><option value="single_choice">{locale === 'ar' ? 'اختيار واحد' : 'Single choice'}</option><option value="text">{locale === 'ar' ? 'إجابة نصية' : 'Text'}</option></select></label></div><label><span className="mb-1 block text-xs font-bold">{locale === 'ar' ? 'نص السؤال' : 'Question text'}</span><textarea required rows={3} value={question.question_text} onChange={e => setQuestion({...question, question_text:e.target.value})} className={inputClass} /></label><div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1 block text-xs font-bold">{locale === 'ar' ? 'المحور' : 'Axis'}</span><input value={question.axis} onChange={e => setQuestion({...question, axis:e.target.value})} className={inputClass} /></label><label><span className="mb-1 block text-xs font-bold">{locale === 'ar' ? 'الخيارات' : 'Options'}</span><input value={question.options} onChange={e => setQuestion({...question, options:e.target.value})} className={inputClass} placeholder={locale === 'ar' ? 'افصل الخيارات بفاصلة' : 'Comma-separated'} /></label></div><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={question.is_required} onChange={e => setQuestion({...question, is_required:e.target.checked})} />{locale === 'ar' ? 'السؤال إلزامي' : 'Required question'}</label>{addQuestion.isError && <p className="text-sm font-bold text-red-600">{locale === 'ar' ? 'تعذر إضافة السؤال. تحقق من عدم تكرار الرقم في الإصدار نفسه.' : 'Unable to add question. Check duplicate number/version.'}</p>}<div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={() => setAdding(false)}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</Button><Button type="submit" isLoading={addQuestion.isPending}>{locale === 'ar' ? 'حفظ السؤال' : 'Save question'}</Button></div></form></Modal>
    </div>
  );
}
