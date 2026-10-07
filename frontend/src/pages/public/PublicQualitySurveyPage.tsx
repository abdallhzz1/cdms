import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Check, CheckCircle2, ClipboardCheck, LockKeyhole, Send } from 'lucide-react';
import { apiFetch, ApiError } from '@/api/client';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n/I18nContext';

type Question = { id: number; question_text: string; question_type: string; options?: string | null; is_required: boolean; axis?: string | null };
type Survey = { public_id: string; title: string; target_group: string; purpose?: string; is_anonymous: boolean; response_policy: string; requires_student_number?: boolean; closes_at?: string; questions: Question[] };
const inputClass = 'mt-3 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100';

export function PublicQualitySurveyPage() {
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const tr = (a: string, e: string) => ar ? a : e;
  const { publicId } = useParams();
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [identifier, setIdentifier] = useState('');
  const [identifierError, setIdentifierError] = useState(false);
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [done, setDone] = useState(false);
  const [missing, setMissing] = useState<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const tokenKey = `cdms-survey-device-${publicId}`;
  let deviceToken = localStorage.getItem(tokenKey);
  if (!deviceToken) { deviceToken = crypto.randomUUID(); localStorage.setItem(tokenKey, deviceToken); }
  const query = useQuery({ queryKey: ['public-quality-survey', publicId], queryFn: () => apiFetch<Survey>(`/public/quality-surveys/${publicId}`), enabled: Boolean(publicId), retry: false });
  const check = useMutation({ mutationFn: () => apiFetch<{ eligible: boolean }>(`/public/quality-surveys/${publicId}/eligibility`, { method: 'POST', body: { respondent_identifier: null, respondent_token: deviceToken } }), onSuccess: result => setEligible(result.eligible) });
  const submit = useMutation({ mutationFn: () => apiFetch(`/public/quality-surveys/${publicId}/submit`, { method: 'POST', body: { respondent_identifier: identifier.trim() || null, respondent_token: deviceToken, answers: Object.entries(answers).map(([question_id, value]) => ({ question_id: Number(question_id), value })) } }), onSuccess: () => setDone(true) });
  useEffect(() => { if (!query.data) return; if (query.data.response_policy !== 'one_per_device') setEligible(true); else if (eligible === null && !check.isPending) check.mutate(); }, [query.data?.response_policy]);
  const grouped = useMemo(() => { const groups = new Map<string, Question[]>(); for (const question of query.data?.questions || []) { const axis = question.axis?.trim() || tr('الأسئلة', 'Questions'); groups.set(axis, [...(groups.get(axis) || []), question]); } return [...groups.entries()]; }, [query.data, locale]);

  if (query.isLoading || check.isPending) return <LoadingState />;
  if (query.isError || !query.data) return <Centered><ErrorState title={tr('الاستبيان غير متاح', 'Survey unavailable')} message={(query.error as ApiError)?.message || tr('تعذر فتح الاستبيان.', 'The survey could not be opened.')} /></Centered>;
  const survey = query.data;
  if (done) return <Status title={tr('تم استلام إجابتك', 'Your response was received')} text={tr('شكرًا لمساهمتك في تحسين جودة التعليم والتدريب.', 'Thank you for helping improve the quality of education and training.')} />;
  if (eligible === false) return <Status title={tr('تم الرد مسبقًا', 'Already submitted')} text={tr('هذا الاستبيان مقيد برد واحد، وقد تم تسجيل ردك سابقًا.', 'This survey allows one response, and yours has already been recorded.')} />;
  if (survey.response_policy === 'one_per_device' && check.isError) return <Centered><ErrorState title={tr('تعذر التحقق من الرد السابق', 'Unable to verify previous response')} onRetry={() => check.mutate()} /></Centered>;
  if (eligible !== true) return <LoadingState />;
  const needsIdentifier = survey.requires_student_number || survey.response_policy === 'one_per_identifier' || !survey.is_anonymous;
  const answered = survey.questions.filter(question => Boolean(answers[question.id]?.trim())).length;
  const progress = survey.questions.length ? Math.round(answered / survey.questions.length * 100) : 0;
  const submitForm = (event: FormEvent) => { event.preventDefault(); if (needsIdentifier && !identifier.trim()) { setIdentifierError(true); formRef.current?.querySelector<HTMLInputElement>('#survey-identifier')?.focus(); return; } const first = survey.questions.find(question => question.is_required && !answers[question.id]?.trim()); if (first) { setMissing(first.id); document.getElementById(`survey-question-${first.id}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' }); return; } setMissing(null); submit.mutate(); };

  return <main dir={ar ? 'rtl' : 'ltr'} className="min-h-screen bg-[#ecf3f1] px-2.5 pb-24 pt-3 text-slate-900 sm:px-5 sm:py-9">
    <div className="mx-auto w-full max-w-[46rem]"><div className="mb-3 flex items-center justify-center gap-2 text-[11px] font-black tracking-wide text-[#315e60]"><ClipboardCheck className="h-4 w-4" />{tr('كلية الطب · الاستبيانات', 'FACULTY OF MEDICINE · SURVEYS')}</div>
      <form ref={formRef} noValidate onSubmit={submitForm} className="overflow-hidden rounded-[1.5rem] border border-[#d7e5e1] bg-white shadow-[0_22px_65px_-45px_rgba(16,62,67,0.65)]">
        <div className="h-1.5 bg-[#155c61]" />
        <header className="px-5 pb-5 pt-6 sm:px-9 sm:pb-7 sm:pt-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-black text-teal-800">{tr('نموذج استبيان', 'SURVEY FORM')}</span>
            <span className="rounded-full bg-[#e8f3f0] px-2.5 py-1 text-[11px] font-bold text-[#155c61]">{survey.target_group}</span>
          </div>
          <h1 className="mt-3 break-words text-2xl font-black leading-[1.45] tracking-tight sm:text-[1.8rem]">{survey.title}</h1>
          {survey.purpose && <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-600">{survey.purpose}</p>}
          {survey.closes_at && <p className="mt-3 text-xs text-slate-500">{tr('آخر موعد للإجابة: ', 'Closes: ')}{new Date(survey.closes_at).toLocaleDateString(ar ? 'ar-PS' : 'en-GB')}</p>}
          <div className="mt-6 flex items-center justify-between text-[11px] font-bold text-slate-500">
            <span>{tr('تقدم الإجابة', 'Your progress')}</span>
            <span dir="ltr" className="text-[#155c61]">{answered} / {survey.questions.length}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#287b76] transition-[width]" style={{ width: `${progress}%` }} /></div>
        </header>

        {needsIdentifier && <section className="border-t border-slate-100 bg-[#fbfdfc] px-5 py-6 sm:px-9"><label htmlFor="survey-identifier" className="block text-sm font-black">{survey.requires_student_number ? tr('الرقم الجامعي', 'University number') : tr('الرقم أو المعرّف', 'Number or identifier')} <span aria-hidden="true" className="text-red-600">*</span></label><input id="survey-identifier" required aria-invalid={identifierError} inputMode={survey.requires_student_number ? 'numeric' : 'text'} autoComplete="off" value={identifier} onChange={event => { setIdentifier(event.target.value); setIdentifierError(false); }} className={`${inputClass} ${identifierError ? 'border-red-400' : ''}`} placeholder={survey.requires_student_number ? tr('اكتب رقمك الجامعي', 'Enter your university number') : tr('اكتب الرقم أو المعرّف', 'Enter number or identifier')} dir="ltr" />{identifierError && <p role="alert" className="mt-2 text-xs font-bold text-red-700">{tr('هذا الحقل مطلوب.', 'This field is required.')}</p>}<p className="mt-2 flex items-start gap-2 text-[11px] leading-5 text-slate-500"><LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" />{survey.requires_student_number ? tr('يُستخدم الرقم لتسجيل المشاركة ومنع التكرار؛ لا نرسل رمزًا بالبريد ولا نتحقق من هوية مُدخل الرقم.', 'The number records participation and prevents duplicates. No email code or identity verification is used.') : survey.is_anonymous ? tr('يُستخدم المعرّف لمنع تكرار الرد، ولا يظهر بجانب إجاباتك.', 'The identifier prevents duplicate submissions and is not shown with your answers.') : tr('سيظهر هذا المعرّف مع إجابتك.', 'This identifier will be shown with your response.')}</p></section>}

        {grouped.map(([axis, questions]) => <section key={axis} aria-label={axis} className="border-t border-slate-100"><div className="bg-[#f8fbfa] px-5 py-3 sm:px-9"><h2 className="text-xs font-black text-[#155c61]">{axis}</h2></div><div className="divide-y divide-slate-100">{questions.map(question => { const index = survey.questions.findIndex(item => item.id === question.id) + 1; return <fieldset id={`survey-question-${question.id}`} key={question.id} className={`min-w-0 px-5 py-6 sm:px-9 sm:py-7 ${missing === question.id ? 'bg-red-50/40' : ''}`}><legend className="sr-only">{question.question_text}</legend><div className="mb-4 flex items-start gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#e7f3f0] text-xs font-black text-[#155c61]">{index}</span><div className="min-w-0"><p className="text-sm font-black leading-6 text-slate-900">{question.question_text}{question.is_required && <span className="ms-1 text-red-600" aria-label={tr('مطلوب', 'Required')}>*</span>}</p>{!question.is_required && <span className="text-[11px] text-slate-400">{tr('اختياري', 'Optional')}</span>}</div></div><Answer question={question} value={answers[question.id] || ''} ar={ar} set={value => { setAnswers(current => ({ ...current, [question.id]: value })); if (missing === question.id) setMissing(null); }} />{missing === question.id && <p role="alert" className="mt-3 text-xs font-bold text-red-700">{tr('هذا السؤال مطلوب.', 'This question is required.')}</p>}</fieldset>; })}</div></section>)}

        {submit.isError && <p role="alert" className="mx-5 my-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-bold text-red-700 sm:mx-9">{(submit.error as ApiError).message}</p>}
        <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-3 py-3 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur sm:static sm:flex sm:items-center sm:justify-between sm:border-t sm:bg-[#f8fbfa] sm:px-9 sm:py-5 sm:shadow-none"><p className="hidden text-xs text-slate-500 sm:block">{tr('راجع إجاباتك قبل الإرسال.', 'Review your answers before submitting.')}</p><Button type="submit" className="h-12 w-full bg-[#155c61] text-sm hover:bg-[#103e43] sm:w-auto sm:min-w-44" isLoading={submit.isPending}><Send className="me-2 h-4 w-4" />{tr('إرسال الإجابات', 'Submit responses')}</Button></footer>
      </form>
    </div>
  </main>;
}

function Answer({ question, value, set, ar }: { question: Question; value: string; set: (value: string) => void; ar: boolean }) {
  const choices = (question.options || '').split(/[,\n]/).map(item => item.trim()).filter(Boolean);
  if (question.question_type === 'rating') return <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label={question.question_text}>{[1, 2, 3, 4, 5].map(number => <label key={number} className={`grid min-h-12 cursor-pointer place-items-center rounded-xl border text-sm font-black transition focus-within:ring-2 focus-within:ring-teal-300 ${value === String(number) ? 'border-[#155c61] bg-[#155c61] text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-teal-400'}`}><input required={question.is_required} className="sr-only" type="radio" name={`q-${question.id}`} value={number} checked={value === String(number)} onChange={event => set(event.target.value)} />{number}</label>)}</div>;
  if (question.question_type === 'multiple_choice') { const selected = value ? value.split('\n') : []; return <div className="grid gap-2">{choices.map(choice => <label key={choice} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm leading-5 transition ${selected.includes(choice) ? 'border-teal-500 bg-[#edf7f4] font-bold text-teal-950' : 'border-slate-200 text-slate-700 hover:border-teal-300'}`}><input type="checkbox" className="h-4 w-4 shrink-0 accent-[#155c61]" checked={selected.includes(choice)} onChange={event => set(event.target.checked ? [...selected, choice].join('\n') : selected.filter(item => item !== choice).join('\n'))} />{choice}{selected.includes(choice) && <Check className="ms-auto h-4 w-4 text-teal-700" />}</label>)}</div>; }
  if (question.question_type === 'single_choice') return <div className="grid gap-2">{choices.map(choice => <label key={choice} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm leading-5 transition ${value === choice ? 'border-teal-500 bg-[#edf7f4] font-bold text-teal-950' : 'border-slate-200 text-slate-700 hover:border-teal-300'}`}><input required={question.is_required} type="radio" className="h-4 w-4 shrink-0 accent-[#155c61]" name={`q-${question.id}`} value={choice} checked={value === choice} onChange={event => set(event.target.value)} />{choice}{value === choice && <Check className="ms-auto h-4 w-4 text-teal-700" />}</label>)}</div>;
  if (question.question_type === 'number') return <input aria-label={question.question_text} required={question.is_required} type="number" inputMode="decimal" value={value} onChange={event => set(event.target.value)} className={inputClass} />;
  if (question.question_type === 'short_text') return <input aria-label={question.question_text} required={question.is_required} type="text" value={value} onChange={event => set(event.target.value)} className={inputClass} placeholder={ar ? 'اكتب إجابتك' : 'Your answer'} />;
  return <textarea aria-label={question.question_text} required={question.is_required} rows={4} value={value} onChange={event => set(event.target.value)} className={inputClass} placeholder={ar ? 'اكتب إجابتك' : 'Your answer'} />;
}
function Centered({ children }: { children: React.ReactNode }) { return <div className="mx-auto mt-20 max-w-xl px-4">{children}</div>; }
function Status({ title, text }: { title: string; text: string }) { return <main className="grid min-h-screen place-items-center bg-[#ecf3f1] px-4"><section className="w-full max-w-xl rounded-[1.5rem] border border-[#d7e5e1] bg-white p-8 text-center shadow-sm sm:p-10"><CheckCircle2 className="mx-auto h-14 w-14 text-teal-700" /><h1 className="mt-5 text-2xl font-black">{title}</h1><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p></section></main>; }
