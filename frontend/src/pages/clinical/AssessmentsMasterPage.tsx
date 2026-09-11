import { useDeferredValue, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { CheckCircle2, ClipboardCheck, Search, Settings2, Users } from 'lucide-react';

type Assessment = any;
type Payload = { items: Assessment[]; pagination: { current_page: number; last_page: number; total: number } };
type Summary = { total: number; submitted: number; returned: number; approved: number; draft: number; batches: number; approved_average_percentage: number | null; clinical_periods:Array<{id:number;code:string;name_ar:string;name_en?:string|null;sequence:number}> };
const input = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100';

export function AssessmentsMasterPage() {
  const { can } = useAuth();
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const tr = (a: string, e: string) => ar ? a : e;
  const [status, setStatus] = useState('submitted');
  const [level, setLevel] = useState('');
  const [periodId,setPeriodId]=useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search.trim());
  const params = useMemo(() => {
    const value = new URLSearchParams({ page_payload: '1', per_page: '25', page: String(page) });
    if (status) value.set('status', status);
    if (level) value.set('academic_level', level);
    if(periodId)value.set('clinical_period_id',periodId);
    if (deferredSearch) value.set('search', deferredSearch);
    return value.toString();
  }, [status, level, periodId, deferredSearch, page]);
  const list = useQuery({ queryKey: ['clinical-assessments', params], queryFn: () => apiFetch<Payload>(`/clinical-assessments?${params}`), enabled: can('assessment.review') });
  const summary = useQuery({ queryKey: ['clinical-assessments-summary',params], queryFn: () => apiFetch<Summary>(`/clinical-assessments-summary?${params}`), enabled: can('assessment.review') });
  if (!can('assessment.review')) return <ErrorState title={tr('لا تملك صلاحية مراجعة التقييمات', 'You do not have permission to review assessments')} />;
  if (list.isLoading || summary.isLoading) return <LoadingState />;
  if (list.isError || summary.isError) return <ErrorState onRetry={() => { list.refetch(); summary.refetch(); }} />;
  const rawData = list.data as Payload | Assessment[] | undefined;
  const data = Array.isArray(rawData)
    ? { items: rawData, pagination: { current_page: 1, last_page: 1, total: rawData.length } }
    : rawData ?? { items: [], pagination: { current_page: 1, last_page: 1, total: 0 } };
  const stats = summary.data ?? { total: 0, submitted: 0, returned: 0, approved: 0, draft: 0, batches: 0, approved_average_percentage: null,clinical_periods:[] };
  const grouped = groupItems(data.items);
  const ready = stats.submitted + stats.approved;

  return <div className="mx-auto max-w-[1280px] space-y-5 pb-12">
    <PageHeader title={tr('سجل التقييمات السريرية', 'Clinical Assessment Records')} description={tr('تصل تقييمات المشرفين مباشرة إلى مساعد البحث والتدريس وتدخل تلقائياً في احتساب العلامة السريرية. الاعتماد يكون على كشف العلامات النهائي.', 'Supervisor assessments arrive directly and automatically contribute to the clinical score. Approval applies to the final grade sheet.')}>
      {can('assessment.criteria.manage') && <Link to="/assessments/criteria" className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-teal-800"><Settings2 className="h-4 w-4" />{tr('إعداد نموذج التقييم', 'Assessment template')}</Link>}
    </PageHeader>
    <section className="rounded-2xl border border-slate-200 bg-white p-3"><select className={input} value={periodId} onChange={event=>{setPeriodId(event.target.value);setPage(1)}}><option value="">{tr('جميع الفترات السريرية','All clinical periods')}</option>{(stats.clinical_periods??[]).map(period=><option key={period.id} value={period.id}>{period.code} — {ar?period.name_ar:period.name_en||period.name_ar}</option>)}</select></section>
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric icon={CheckCircle2} label={tr('جاهزة لكشف العلامات', 'Ready for grade sheet')} value={ready} hint={tr('لا تحتاج اعتماداً منفصلاً', 'No separate approval required')} /><Metric icon={ClipboardCheck} label={tr('وصلت من المشرفين', 'Received from supervisors')} value={stats.submitted} hint={tr('مدخلات سريرية رسمية', 'Official clinical inputs')} /><Metric icon={Users} label={tr('حزم مجموعات', 'Group batches')} value={stats.batches} hint={`${stats.total} ${tr('تقييم', 'assessments')}`} /><Metric icon={Settings2} label={tr('مسودات أو معادة', 'Draft or returned')} value={stats.draft + stats.returned} hint={tr('لا تدخل كشف العلامات', 'Excluded from grade sheet')} /></section>
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"><div className="grid gap-3 lg:grid-cols-[1fr_13rem_13rem_auto]"><label className="relative"><Search className={`absolute top-3.5 h-4 w-4 text-slate-400 ${ar ? 'right-3' : 'left-3'}`} /><input className={`${input} ${ar ? 'pr-10' : 'pl-10'}`} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder={tr('بحث بالطالب أو الرقم أو الطبيب أو المساق…', 'Search student, ID, evaluator, or course…')} /></label><select className={input} value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">{tr('كل الحالات', 'All statuses')}</option><option value="submitted">{tr('جاهز لكشف العلامات', 'Ready for grade sheet')}</option><option value="returned">{tr('بحاجة لتصحيح', 'Needs correction')}</option><option value="approved">{tr('مرحّل سابقاً', 'Previously approved')}</option><option value="draft">{tr('مسودة', 'Draft')}</option></select><select className={input} value={level} onChange={e => { setLevel(e.target.value); setPage(1); }}><option value="">{tr('كل الدفعات المخولة', 'All authorized cohorts')}</option><option value="fourth">{tr('السنة الرابعة', 'Fourth year')}</option><option value="fifth">{tr('السنة الخامسة', 'Fifth year')}</option><option value="sixth">{tr('السنة السادسة', 'Sixth year')}</option></select><button className="h-11 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-600" onClick={() => { setSearch(''); setStatus('submitted'); setLevel(''); setPage(1); }}>{tr('مسح', 'Clear')}</button></div><p className="mt-3 border-t border-slate-100 pt-3 text-[11px] text-slate-500">{tr(`النتائج: ${data.pagination.total}`, `${data.pagination.total} results`)}</p></section>
    {!grouped.length ? <EmptyState message={tr('لا توجد تقييمات مطابقة للفلاتر.', 'No assessments match the filters.')} /> : <section className="space-y-3">{grouped.map(group => <GroupCard key={group.key} group={group} ar={ar} />)}</section>}
    {data.pagination.last_page > 1 && <nav className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-3 text-xs"><button disabled={page <= 1} className="rounded-xl border border-slate-200 px-3 py-2 font-bold disabled:opacity-40" onClick={() => setPage(p => p - 1)}>{tr('السابق', 'Previous')}</button><span>{tr(`صفحة ${data.pagination.current_page} من ${data.pagination.last_page}`, `Page ${data.pagination.current_page} of ${data.pagination.last_page}`)}</span><button disabled={page >= data.pagination.last_page} className="rounded-xl border border-slate-200 px-3 py-2 font-bold disabled:opacity-40" onClick={() => setPage(p => p + 1)}>{tr('التالي', 'Next')}</button></nav>}
  </div>;
}

function Metric({ icon: Icon, label, value, hint }: any) { return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><Icon className="h-5 w-5" /></span><div><p className="text-[11px] font-bold text-slate-500">{label}</p><p className="text-xl font-black text-slate-900">{value}</p></div></div><p className="mt-3 border-t border-slate-100 pt-2 text-[10px] text-slate-400">{hint}</p></article>; }
function groupItems(items: Assessment[]) { const map = new Map<string, any>(); items.forEach(item => { const key = item.assessment_batch_uuid || `single-${item.id}`; const group = map.get(key) || { key, first: item, items: [] }; group.items.push(item); map.set(key, group); }); return [...map.values()]; }
function GroupCard({ group, ar }: any) { const tr = (a: string, e: string) => ar ? a : e; const first = group.first; const course = first.session?.rotation_block?.rotation?.course; const score = group.items.reduce((sum: number, item: any) => sum + (Number(item.max_score) ? Number(item.score) / Number(item.max_score) * 20 : 0), 0) / group.items.length; const status = statusLabel(first.status, ar); return <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><header className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-black text-slate-900">{first.assessment_batch_uuid ? tr(`تقييم مجموعة · ${group.items.length} طلاب`, `Group assessment · ${group.items.length} students`) : tr('تقييم طالب', 'Student assessment')}</h2><span className={`rounded-lg px-2 py-1 text-[10px] font-bold ${status.className}`}>{status.label}</span></div><p className="mt-1 truncate text-[11px] text-slate-500">{ar ? course?.name_ar : course?.name_en || course?.name_ar || '—'} {course?.code ? `· ${course.code}` : ''}</p><p className="mt-1 text-[10px] text-slate-400">{ar ? first.evaluator?.full_name_ar : first.evaluator?.full_name_en || first.evaluator?.full_name_ar || '—'} · {String(first.session?.session_date || first.submitted_at || first.created_at || '').slice(0, 10)}</p></div><span className="rounded-xl bg-teal-50 px-3 py-2 text-sm font-black text-teal-700">{score.toFixed(1)} / 20</span></header><div className="divide-y divide-slate-100">{group.items.map((item: any, index: number) => <div key={item.id} className="grid gap-3 px-4 py-3 sm:grid-cols-[2rem_1fr_7rem_1.2fr] sm:items-center"><span className="hidden h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-black text-slate-500 sm:flex">{index + 1}</span><div><p className="text-xs font-black text-slate-800">{ar ? item.student?.full_name_ar : item.student?.full_name_en || item.student?.full_name_ar || '—'}</p><p className="font-mono text-[10px] text-slate-500">{item.student?.university_number}</p></div><span className="w-fit rounded-xl bg-teal-50 px-3 py-1.5 text-sm font-black text-teal-700">{Number(item.score).toFixed(1)} / {Number(item.max_score).toFixed(0)}</span><p className="text-[11px] leading-5 text-slate-500">{item.notes || tr('لا توجد ملاحظات.', 'No notes.')}</p></div>)}</div></article>; }
function statusLabel(status: string, ar: boolean) { const values: any = { draft: [ar ? 'مسودة' : 'Draft', 'bg-slate-100 text-slate-600'], submitted: [ar ? 'جاهز لكشف العلامات' : 'Ready for grade sheet', 'bg-teal-50 text-teal-700'], approved: [ar ? 'مرحّل سابقاً' : 'Previously approved', 'bg-teal-100 text-teal-800'], returned: [ar ? 'بحاجة لتصحيح' : 'Needs correction', 'bg-slate-100 text-slate-700'] }; const item = values[status] || values.draft; return { label: item[0], className: item[1] }; }
