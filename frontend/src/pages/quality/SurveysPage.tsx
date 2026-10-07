import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Plus, Search } from 'lucide-react';
import { apiFetch, apiFetchEnvelope, ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
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
const field = 'w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100';

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
  return <div className="mx-auto w-full max-w-6xl space-y-4 pb-14">
    <PageHeader title={ar ? 'الاستبيانات' : 'Surveys'} description={ar ? 'أنشئ النموذج وتابع نشره وردوده.' : 'Create forms and track publishing and responses.'}>
      {can('quality.manage') && <Button onClick={() => { setForm({ ...blank, academic_year: options.data?.academic_years.find(item => item.is_current)?.code || '' }); create.reset(); setOpen(true); }}><Plus className="ms-1 h-4 w-4" />{ar ? 'استبيان جديد' : 'New survey'}</Button>}
    </PageHeader>
    <section aria-label={ar ? 'تصفية الاستبيانات' : 'Filter surveys'} className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_10rem_11rem] sm:p-4">
      <label className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 px-3"><Search className="h-4 w-4 shrink-0 text-slate-400" /><input aria-label={ar ? 'بحث في الاستبيانات' : 'Search surveys'} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder={ar ? 'العنوان أو الرمز أو الفئة' : 'Title, code, or audience'} /></label>
      <select aria-label={ar ? 'حالة الاستبيان' : 'Survey status'} value={status} onChange={event => { setStatus(event.target.value); setPage(1); }} className={field}><option value="">{ar ? 'جميع الحالات' : 'All statuses'}</option>{Object.entries(statusText).map(([key, labels]) => <option key={key} value={key}>{labels[ar ? 0 : 1]}</option>)}</select>
      <select aria-label={ar ? 'العام الأكاديمي' : 'Academic year'} value={year} onChange={event => { setYear(event.target.value); setPage(1); }} className={field}><option value="">{ar ? 'جميع الأعوام' : 'All years'}</option>{options.data?.academic_years.map(item => <option key={item.id} value={item.code}>{item.code}</option>)}</select>
    </section>
    {!items.length ? <EmptyState message={ar ? 'لا توجد استبيانات مطابقة.' : 'No matching surveys.'} /> : <section aria-label={ar ? 'قائمة الاستبيانات' : 'Survey list'} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="divide-y divide-slate-100">{items.map(survey => <article key={survey.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:p-5">
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="break-words text-sm font-black text-slate-900">{survey.title}</h2><span className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${survey.status === 'open' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{statusText[survey.status]?.[ar ? 0 : 1] || survey.status}</span></div><p className="mt-1 text-xs text-slate-500">{survey.code} · {audience.find(item => item.value === survey.target_group)?.[ar ? 'ar' : 'en'] || survey.target_group}{survey.academic_year ? ` · ${survey.academic_year}` : ''}</p><p className="mt-1 text-xs text-slate-500">{survey.questions_count || 0} {ar ? 'سؤال' : 'questions'} · {survey.submissions_count || 0} {ar ? 'رد مكتمل' : 'completed responses'}</p></div>
        <div className="flex shrink-0 items-center gap-3"><Link to={`/quality/surveys/${survey.id}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-teal-50 px-3 text-xs font-black text-teal-700 hover:bg-teal-100">{ar ? 'فتح الاستبيان' : 'Open survey'}<ArrowLeft className="h-4 w-4" /></Link>{survey.status === 'open' && <a href={`/survey/${survey.public_id}`} target="_blank" rel="noopener noreferrer" aria-label={ar ? 'فتح النموذج العام' : 'Open public form'} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:text-teal-700"><ExternalLink className="h-4 w-4" /></a>}</div>
      </article>)}</div>
    </section>}
    {lastPage > 1 && <nav aria-label={ar ? 'صفحات الاستبيانات' : 'Survey pages'} className="flex items-center justify-center gap-3"><Button variant="outline" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>{ar ? 'السابق' : 'Previous'}</Button><span className="text-xs text-slate-600">{page} / {lastPage}</span><Button variant="outline" disabled={page >= lastPage} onClick={() => setPage(value => value + 1)}>{ar ? 'التالي' : 'Next'}</Button></nav>}
    <Modal isOpen={open} onClose={() => setOpen(false)} title={ar ? 'إنشاء استبيان' : 'Create survey'}><form onSubmit={(event: FormEvent) => { event.preventDefault(); create.mutate(); }} className="space-y-4">
      <label><span className="mb-1 block text-xs font-bold">{ar ? 'عنوان الاستبيان' : 'Survey title'}</span><input autoFocus required value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} className={field} /></label>
      <div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1 block text-xs font-bold">{ar ? 'الفئة المستهدفة' : 'Audience'}</span><select value={form.target_group} onChange={event => setForm({ ...form, target_group: event.target.value })} className={field}>{audience.map(item => <option key={item.value} value={item.value}>{ar ? item.ar : item.en}</option>)}</select></label><label><span className="mb-1 block text-xs font-bold">{ar ? 'العام الأكاديمي' : 'Academic year'}</span><select required value={form.academic_year} onChange={event => setForm({ ...form, academic_year: event.target.value })} className={field}><option value="">{ar ? 'اختر العام' : 'Select year'}</option>{options.data?.academic_years.map(item => <option key={item.id} value={item.code}>{item.code}{item.is_current ? (ar ? ' — الحالي' : ' — Current') : ''}</option>)}</select></label></div>
      {form.target_group === 'الطلبة' && <fieldset className="rounded-xl border border-slate-200 p-3"><legend className="px-1 text-xs font-bold">{ar ? 'الدفعات المستهدفة' : 'Target cohorts'}</legend><div className="flex flex-wrap gap-2">{([['fourth','الرابعة','Fourth'],['fifth','الخامسة','Fifth'],['sixth','السادسة','Sixth']] as const).map(([value,arLabel,enLabel]) => <label key={value} className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-bold"><input type="checkbox" checked={form.target_levels.includes(value)} onChange={event => setForm({ ...form, target_levels: event.target.checked ? [...form.target_levels,value] : form.target_levels.filter(level => level !== value) })} />{ar ? arLabel : enLabel}</label>)}</div><p className="mt-2 text-[11px] text-slate-500">{ar ? 'سيسجل النظام مشاركة كل طالب في هذه الدفعات برقمِه الجامعي، بدون رمز بريد.' : 'Students enter their university number; no email code is required.'}</p></fieldset>}
      <label><span className="mb-1 block text-xs font-bold">{ar ? 'وصف للمجيب (اختياري)' : 'Description for respondents (optional)'}</span><textarea rows={2} value={form.purpose} onChange={event => setForm({ ...form, purpose: event.target.value })} className={field} /></label>
      {form.target_group === 'الطلبة' ? <p className="rounded-xl bg-teal-50 p-3 text-xs leading-5 text-teal-800">{ar ? 'تظهر المشاركة بالاسم، بينما تُحفظ الإجابات منفصلة عنه. لا يمكن التحقق من أن مُدخل الرقم هو صاحبه دون خطوة تحقق إضافية.' : 'Participation is shown by name, while answers are stored separately. Without verification, a typed number does not prove who submitted it.'}</p> : <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-sm font-bold"><span>{ar ? 'إجابات مجهولة الهوية' : 'Anonymous responses'}</span><input type="checkbox" checked={form.is_anonymous} onChange={event => setForm({ ...form, is_anonymous: event.target.checked })} /></label>}
      {create.isError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{create.error instanceof ApiError ? create.error.message : (ar ? 'تعذر إنشاء الاستبيان.' : 'Unable to create survey.')}</p>}
      <div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={() => setOpen(false)}>{ar ? 'إلغاء' : 'Cancel'}</Button><Button type="submit" disabled={form.target_group === 'الطلبة' && !form.target_levels.length} isLoading={create.isPending}>{ar ? 'إنشاء وفتح' : 'Create and open'}</Button></div>
    </form></Modal>
  </div>;
}
