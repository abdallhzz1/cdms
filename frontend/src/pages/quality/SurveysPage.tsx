import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpLeft, BarChart3, BookOpenText, ExternalLink, FilePlus2, Search, SlidersHorizontal } from 'lucide-react';
import { apiFetch, apiFetchEnvelope, ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

type Year = { id: number; code: string; is_current: boolean };
type Survey = { id: number; public_id: string; code: string; title: string; purpose?: string; target_group: string; academic_year?: string; status: string; questions_count: number; submissions_count?: number };
const audience = [
  { value: 'الطلبة', ar: 'الطلبة', en: 'Students' },
  { value: 'المشرفون السريريون', ar: 'المشرفون السريريون', en: 'Clinical supervisors' },
  { value: 'أعضاء الهيئة التدريسية', ar: 'أعضاء الهيئة التدريسية', en: 'Faculty' },
  { value: 'الخريجون', ar: 'الخريجون', en: 'Graduates' },
  { value: 'جهات التدريب', ar: 'جهات التدريب', en: 'Training partners' },
];
const statusText: Record<string, [string, string]> = { draft: ['مسودة', 'Draft'], open: ['يستقبل ردودًا', 'Accepting responses'], closed: ['مغلق', 'Closed'], archived: ['مؤرشف', 'Archived'] };
const blank = { title: '', target_group: audience[0].value, target_levels: ['fourth', 'fifth', 'sixth'], academic_year: '', purpose: '', is_anonymous: true };
const field = 'min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100';

export function SurveysPage() {
  const { can } = useAuth();
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const client = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [year, setYear] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300); return () => window.clearTimeout(timer); }, [search]);
  const params = new URLSearchParams({ per_page: '20', page: String(page) });
  if (debouncedSearch) params.set('search', debouncedSearch);
  if (status) params.set('status', status);
  if (year) params.set('academic_year', year);
  const query = useQuery({ queryKey: ['quality-surveys', page, debouncedSearch, status, year], queryFn: () => apiFetchEnvelope<Survey[]>(`/quality-surveys?${params}`), enabled: can('quality.view') });
  const options = useQuery({ queryKey: ['quality-options'], queryFn: () => apiFetch<{ academic_years: Year[] }>('/quality-options'), enabled: can('quality.view') });
  const create = useMutation({ mutationFn: () => apiFetch<Survey>('/quality-surveys', { method: 'POST', body: { ...form, target_levels: form.target_group === 'الطلبة' ? form.target_levels : undefined } }), onSuccess: async survey => { await client.invalidateQueries({ queryKey: ['quality-surveys'] }); setOpen(false); setForm(blank); navigate(`/quality/surveys/${survey.id}`); } });

  if (!can('quality.view')) return <ErrorState title={ar ? 'غير مصرح' : 'Access denied'} />;
  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) return <ErrorState onRetry={() => query.refetch()} />;
  const items = query.data.data;
  const lastPage = Number(query.data.meta.last_page || 1);
  const total = Number(query.data.meta.total || items.length);
  const startNew = () => { setForm({ ...blank, academic_year: options.data?.academic_years.find(item => item.is_current)?.code || '' }); create.reset(); setOpen(true); };

  return <main className="mx-auto w-full max-w-7xl space-y-5 pb-16 sm:space-y-7">
    <header className="relative overflow-hidden rounded-[1.75rem] bg-[#103e43] px-5 py-7 text-white shadow-[0_18px_45px_-30px_rgba(15,55,60,0.8)] sm:px-8 sm:py-9">
      <div aria-hidden="true" className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full border border-white/10" />
      <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl"><p className="text-[11px] font-black tracking-[0.14em] text-teal-200">{ar ? 'إدارة الجودة · كلية الطب' : 'QUALITY · FACULTY OF MEDICINE'}</p><h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">{ar ? 'الاستبيانات' : 'Surveys'}</h1><p className="mt-2 text-sm leading-6 text-teal-50/80">{ar ? 'من إعداد الأسئلة إلى متابعة المشاركة وقراءة النتائج، كل استبيان في مساحة عمل واحدة.' : 'Create questions, follow participation and read results in one workspace per survey.'}</p></div>
        {can('quality.manage') && <button type="button" onClick={startNew} className="inline-flex min-h-12 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-black text-[#103e43] shadow-sm transition hover:bg-teal-50 md:w-auto"><FilePlus2 className="h-4 w-4" />{ar ? 'إنشاء استبيان' : 'Create survey'}</button>}
      </div>
    </header>

    <section aria-label={ar ? 'تصفية الاستبيانات' : 'Filter surveys'} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="flex items-center justify-between gap-3 px-1 pb-3"><div className="flex items-center gap-2 text-xs font-black text-slate-700"><SlidersHorizontal className="h-4 w-4 text-teal-700" />{ar ? 'تصفية القائمة' : 'Find a survey'}</div><span className="text-[11px] font-semibold text-slate-500">{total} {ar ? 'استبيان' : 'surveys'}</span></div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_11rem]"><label className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-100"><Search className="h-4 w-4 shrink-0 text-slate-400" /><input aria-label={ar ? 'بحث في الاستبيانات' : 'Search surveys'} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder={ar ? 'ابحث بالعنوان أو الفئة' : 'Search title or audience'} /></label><select aria-label={ar ? 'حالة الاستبيان' : 'Survey status'} value={status} onChange={event => { setStatus(event.target.value); setPage(1); }} className={field}><option value="">{ar ? 'كل الحالات' : 'All statuses'}</option>{Object.entries(statusText).map(([key, labels]) => <option key={key} value={key}>{labels[ar ? 0 : 1]}</option>)}</select><select aria-label={ar ? 'العام الأكاديمي' : 'Academic year'} value={year} onChange={event => { setYear(event.target.value); setPage(1); }} className={field}><option value="">{ar ? 'كل الأعوام' : 'All years'}</option>{options.data?.academic_years.map(item => <option key={item.id} value={item.code}>{item.code}</option>)}</select></div>
    </section>

    {!items.length ? <section className="rounded-[1.5rem] border border-dashed border-slate-300 bg-white px-5 py-14 text-center"><BookOpenText className="mx-auto h-10 w-10 text-teal-700" /><h2 className="mt-4 text-base font-black text-slate-900">{ar ? 'لا توجد استبيانات مطابقة' : 'No matching surveys'}</h2><p className="mt-1 text-sm text-slate-500">{ar ? 'جرّب تغيير البحث أو عوامل التصفية.' : 'Try another search or filter.'}</p></section> : <section aria-label={ar ? 'قائمة الاستبيانات' : 'Survey list'} className="grid gap-3 lg:grid-cols-2">
      {items.map(survey => <article key={survey.id} className="group flex min-w-0 flex-col overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white shadow-[0_8px_30px_-24px_rgba(15,23,42,0.55)] transition hover:border-teal-200 hover:shadow-[0_16px_35px_-25px_rgba(15,80,80,0.5)]">
        <div className="flex flex-1 gap-4 p-4 sm:p-5"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-teal-50 text-teal-800"><BookOpenText className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black ${survey.status === 'open' ? 'bg-emerald-50 text-emerald-800' : survey.status === 'draft' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{statusText[survey.status]?.[ar ? 0 : 1] || survey.status}</span><span className="text-[11px] font-semibold text-slate-400" dir="ltr">{survey.code}</span></div><h2 className="mt-2 break-words text-base font-black leading-7 text-slate-900"><Link to={`/quality/surveys/${survey.id}`} className="outline-none group-hover:text-teal-800 focus-visible:underline">{survey.title}</Link></h2><p className="mt-1 text-xs leading-5 text-slate-500">{audience.find(item => item.value === survey.target_group)?.[ar ? 'ar' : 'en'] || survey.target_group}{survey.academic_year ? ` · ${survey.academic_year}` : ''}</p></div></div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5"><div className="flex items-center gap-4 text-[11px] font-bold text-slate-600"><span className="inline-flex items-center gap-1.5"><BookOpenText className="h-3.5 w-3.5 text-slate-400" />{survey.questions_count || 0} {ar ? 'سؤال' : 'questions'}</span><span className="inline-flex items-center gap-1.5"><BarChart3 className="h-3.5 w-3.5 text-slate-400" />{survey.submissions_count || 0} {ar ? 'رد مكتمل' : 'completed responses'}</span></div><div className="flex items-center gap-2"><Link to={`/quality/surveys/${survey.id}`} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-black text-teal-800 hover:bg-teal-50">{ar ? 'فتح الاستبيان' : 'Open survey'}<ArrowUpLeft className="h-4 w-4" /></Link>{survey.status === 'open' && <a href={`/survey/${survey.public_id}`} target="_blank" rel="noopener noreferrer" aria-label={ar ? 'فتح النموذج العام' : 'Open public form'} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-teal-700"><ExternalLink className="h-4 w-4" /></a>}</div></div>
      </article>)}
    </section>}

    {lastPage > 1 && <nav aria-label={ar ? 'صفحات الاستبيانات' : 'Survey pages'} className="flex items-center justify-center gap-3"><Button variant="outline" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>{ar ? 'السابق' : 'Previous'}</Button><span className="text-xs text-slate-600">{page} / {lastPage}</span><Button variant="outline" disabled={page >= lastPage} onClick={() => setPage(value => value + 1)}>{ar ? 'التالي' : 'Next'}</Button></nav>}

    <Modal isOpen={open} onClose={() => setOpen(false)} title={ar ? 'استبيان جديد' : 'New survey'}><form onSubmit={(event: FormEvent) => { event.preventDefault(); create.mutate(); }} className="space-y-4"><p className="text-xs leading-5 text-slate-500">{ar ? 'ابدأ بالمعلومات الأساسية؛ ستضيف الأسئلة وتنشر النموذج من مساحة الاستبيان.' : 'Start with the essentials. Add questions and publish from the survey workspace.'}</p><label className="block"><span className="mb-1.5 block text-xs font-bold">{ar ? 'عنوان الاستبيان' : 'Survey title'}</span><input autoFocus required value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} className={field} /></label><div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1.5 block text-xs font-bold">{ar ? 'الفئة المستهدفة' : 'Audience'}</span><select value={form.target_group} onChange={event => setForm({ ...form, target_group: event.target.value })} className={field}>{audience.map(item => <option key={item.value} value={item.value}>{ar ? item.ar : item.en}</option>)}</select></label><label><span className="mb-1.5 block text-xs font-bold">{ar ? 'العام الأكاديمي' : 'Academic year'}</span><select required value={form.academic_year} onChange={event => setForm({ ...form, academic_year: event.target.value })} className={field}><option value="">{ar ? 'اختر العام' : 'Select year'}</option>{options.data?.academic_years.map(item => <option key={item.id} value={item.code}>{item.code}{item.is_current ? (ar ? ' — الحالي' : ' — Current') : ''}</option>)}</select></label></div>{form.target_group === 'الطلبة' && <fieldset className="rounded-xl border border-slate-200 p-3"><legend className="px-1 text-xs font-bold">{ar ? 'الدفعات المستهدفة' : 'Target cohorts'}</legend><div className="flex flex-wrap gap-2">{([['fourth','الرابعة','Fourth'],['fifth','الخامسة','Fifth'],['sixth','السادسة','Sixth']] as const).map(([value,arLabel,enLabel]) => <label key={value} className={`flex min-h-10 items-center gap-2 rounded-lg border px-3 text-xs font-bold ${form.target_levels.includes(value) ? 'border-teal-300 bg-teal-50 text-teal-900' : 'border-slate-200'}`}><input type="checkbox" className="accent-teal-700" checked={form.target_levels.includes(value)} onChange={event => setForm({ ...form, target_levels: event.target.checked ? [...form.target_levels,value] : form.target_levels.filter(level => level !== value) })} />{ar ? arLabel : enLabel}</label>)}</div></fieldset>}<label className="block"><span className="mb-1.5 block text-xs font-bold">{ar ? 'وصف يظهر للمجيب (اختياري)' : 'Description for respondents (optional)'}</span><textarea rows={2} value={form.purpose} onChange={event => setForm({ ...form, purpose: event.target.value })} className={`${field} py-3`} /></label>{form.target_group === 'الطلبة' ? <p className="text-[11px] leading-5 text-slate-500">{ar ? 'تُعرض حالة المشاركة منفصلة عن الإجابات. الرقم الجامعي المدخل لا يثبت الهوية.' : 'Participation is separate from answers. A typed student number does not verify identity.'}</p> : <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 text-sm font-bold"><span>{ar ? 'إجابات مجهولة الهوية' : 'Anonymous responses'}</span><input type="checkbox" className="accent-teal-700" checked={form.is_anonymous} onChange={event => setForm({ ...form, is_anonymous: event.target.checked })} /></label>}{create.isError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{create.error instanceof ApiError ? create.error.message : (ar ? 'تعذر إنشاء الاستبيان.' : 'Unable to create survey.')}</p>}<div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={() => setOpen(false)}>{ar ? 'إلغاء' : 'Cancel'}</Button><Button type="submit" disabled={form.target_group === 'الطلبة' && !form.target_levels.length} isLoading={create.isPending}>{ar ? 'إنشاء الاستبيان' : 'Create survey'}</Button></div></form></Modal>
  </main>;
}
