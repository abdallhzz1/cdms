import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { apiFetchEnvelope } from '@/api/client';
import { useI18n } from '@/i18n/I18nContext';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';

type Level = 'fourth' | 'fifth' | 'sixth';
type Student = { id: number; full_name_ar: string; full_name_en?: string | null; university_number: string; university_email?: string | null; photo_url?: string | null; academic_level: Level; completed_on?: string | null };
type Report = { summary: Record<Level, { total: number; completed: number }>; students: Student[] };
const levelNames: Record<Level, [string, string]> = { fourth: ['الرابعة', 'Fourth'], fifth: ['الخامسة', 'Fifth'], sixth: ['السادسة', 'Sixth'] };
const field = 'h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-500';

export function SurveyParticipationPage() {
  const { id } = useParams();
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const [level, setLevel] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300); return () => window.clearTimeout(timer); }, [search]);
  const params = new URLSearchParams({ page: String(page), per_page: '25' });
  if (level) params.set('academic_level', level);
  if (status) params.set('status', status);
  if (debouncedSearch) params.set('search', debouncedSearch);
  const query = useQuery({ queryKey: ['quality-participation', id, page, level, status, debouncedSearch], queryFn: () => apiFetchEnvelope<Report>(`/quality-surveys/${id}/participation?${params}`) });
  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) return <ErrorState onRetry={() => query.refetch()} />;
  const { summary, students } = query.data.data;
  const totals = Object.values(summary).reduce((value, item) => ({ total: value.total + item.total, completed: value.completed + item.completed }), { total: 0, completed: 0 });
  const lastPage = Number(query.data.meta.last_page || 1);
  return <main className="mx-auto w-full max-w-6xl space-y-4 pb-16">
    <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"><Link to={`/quality/surveys/${id}`} className="text-xs font-bold text-teal-700">← {ar ? 'الاستبيان' : 'Survey'}</Link><h1 className="mt-3 text-xl font-black sm:text-2xl">{ar ? 'متابعة مشاركة الطلبة' : 'Student participation'}</h1><p className="mt-1 text-xs text-slate-500">{ar ? 'تظهر حالة الإكمال فقط؛ الإجابات لا تُعرض بجانب أسماء الطلبة. لا يُتحقق من هوية مُدخل الرقم الجامعي.' : 'Only completion status is shown. Answers are not displayed beside student names. Entered numbers are not identity-verified.'}</p></header>
    <section aria-label={ar ? 'ملخص المشاركة' : 'Participation summary'} className="grid gap-2 sm:grid-cols-4"><Count title={ar ? 'الإجمالي' : 'Total'} total={totals.total} completed={totals.completed} />{(Object.keys(summary) as Level[]).map(key => <Count key={key} title={levelNames[key]?.[ar ? 0 : 1] || key} total={summary[key].total} completed={summary[key].completed} />)}</section>
    <section aria-label={ar ? 'تصفية الطلبة' : 'Filter students'} className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_10rem_10rem] sm:p-4"><label className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 px-3"><Search className="h-4 w-4 shrink-0 text-slate-400"/><input aria-label={ar ? 'اسم الطالب أو رقمه' : 'Name or number'} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder={ar ? 'اسم الطالب أو رقمه' : 'Student name or number'} /></label><select aria-label={ar ? 'الدفعة' : 'Cohort'} value={level} onChange={event => { setLevel(event.target.value); setPage(1); }} className={field}><option value="">{ar ? 'كل الدفعات' : 'All cohorts'}</option>{(Object.keys(summary) as Level[]).map(key => <option key={key} value={key}>{levelNames[key]?.[ar ? 0 : 1]}</option>)}</select><select aria-label={ar ? 'حالة المشاركة' : 'Participation status'} value={status} onChange={event => { setStatus(event.target.value); setPage(1); }} className={field}><option value="">{ar ? 'الكل' : 'All'}</option><option value="completed">{ar ? 'أجاب' : 'Completed'}</option><option value="pending">{ar ? 'لم يجب' : 'Pending'}</option></select></section>
    {!students.length ? <EmptyState message={ar ? 'لا يوجد طلبة مطابقون.' : 'No matching students.'} /> : <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="divide-y divide-slate-100">{students.map(student => <article key={student.id} className="flex items-center justify-between gap-3 p-3 sm:p-4"><div className="flex min-w-0 items-center gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-teal-50 text-sm font-bold text-teal-700">{student.photo_url ? <img src={student.photo_url} alt="" className="h-full w-full object-cover"/> : student.full_name_ar.slice(0,1)}</div><div className="min-w-0"><p className="truncate text-sm font-bold">{ar ? student.full_name_ar : student.full_name_en || student.full_name_ar}</p><p className="text-[11px] text-slate-500" dir="ltr">{student.university_number} · {levelNames[student.academic_level]?.[ar ? 0 : 1]}</p></div></div><span className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold ${student.completed_on ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{student.completed_on ? (ar ? 'أجاب' : 'Completed') : (ar ? 'لم يجب' : 'Pending')}</span></article>)}</div></section>}
    {lastPage > 1 && <nav className="flex items-center justify-center gap-3"><Button variant="outline" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>{ar ? 'السابق' : 'Previous'}</Button><span className="text-xs">{page} / {lastPage}</span><Button variant="outline" disabled={page >= lastPage} onClick={() => setPage(value => value + 1)}>{ar ? 'التالي' : 'Next'}</Button></nav>}
  </main>;
}

function Count({ title, total, completed }: { title: string; total: number; completed: number }) { return <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs font-bold text-slate-500">{title}</p><p className="mt-1 text-lg font-black text-teal-800">{completed} / {total}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-teal-600" style={{ width: `${total ? completed / total * 100 : 0}%` }}/></div></div>; }
