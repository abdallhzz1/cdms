import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { apiFetch, ApiError } from '@/api/client';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';

type Kind = 'clinical' | 'mini_osce' | 'final_osce';
type Option = { id: number; name?: string; full_name_ar?: string; code?: string; name_ar?: string; student_group_id?: number; group_name?: string; academic_year?: string; academic_level?: string };
type Overview = {
  counts: { clinical: number; clinical_historical: number; mini_osce: number; mini_historical: number; final_osce: number };
  courses: Option[]; supervisors: Option[]; groups: Option[]; subgroups: Option[];
};
type RecordRow = {
  type: Kind; record_id: number; student_id: number; student_name: string; university_number: string;
  supervisor_name?: string | null; course_code?: string | null; course_name?: string | null;
  group_name?: string | null; subgroup_name?: string | null; evaluation_week?: number | null;
  from_week?: number | null; to_week?: number | null; assessment_kind?: string | null;
  score: string | number | null; max_score?: string | number | null; status?: string | null;
  finding: string; version_id?: number | null; is_current?: boolean | number | null;
  assignment_id?: number | null; updated_at: string; submitted_at?: string | null;
  snapshot?: string;
};
type Listing = { items: RecordRow[]; pagination: { current_page: number; last_page: number; total: number; per_page: number } };
type Gap = {
  kind: 'clinical' | 'mini_osce'; assignment_id: number; version_id: number; student_id: number;
  student_name: string; university_number: string; supervisor_name: string;
  course_code: string; course_name: string; group_name: string | null; subgroup_name: string | null;
  from_week: number; to_week: number; max_score: number | string; assessment_kind: 'weekly' | 'period';
};
type GapListing = { items: Gap[]; pagination: Listing['pagination'] };
type Audit = { id: number; action: string; actor: string | null; reason: string | null; changes: unknown; created_at: string };
type Detail = {
  record: RecordRow; restore: { allowed: boolean; reason: string | null; current_version_id: number | null; target_assignment_id: number | null } | null;
  grade: { id: number; status: string; clinical_score: string | null; osce_score: string | null; written_score: string | null; total_score: string | null; official_clinical_score?: number | null; clinical_outdated?: boolean; updated_at?: string | null; snapshot?: string } | null;
  peers: RecordRow[]; audits: Audit[];
};

const findingLabels: Record<string, [string, string]> = {
  current: ['حالي وصحيح', 'Current'], restorable: ['علامة تاريخية قابلة للاستعادة', 'Historical mark can be restored'],
  current_assessment_exists: ['له تقييم في النسخة الحالية', 'Current assessment exists'],
  assignment_changed: ['تغيّر التكليف', 'Assignment changed'],
  ambiguous_current_assignment: ['تكليف حالي غير محدد', 'Ambiguous current assignment'],
  ambiguous_source_assignment: ['تكليف قديم غير محدد', 'Ambiguous old assignment'],
  ambiguous_old_assessments: ['علامات تاريخية متعارضة', 'Conflicting historical marks'],
  no_unique_current_version: ['لا توجد نسخة حالية وحيدة', 'No unique current version'],
  old_assignment_mismatch: ['السجل لا يطابق التكليف القديم', 'Old assignment mismatch'],
  week_outside_assignment: ['الأسبوع خارج التكليف', 'Week outside assignment'],
  duplicate_current: ['تقييمان حاليان لنفس الموعد', 'Duplicate current assessments'],
  assignment_mismatch: ['المشرف أو الطالب لا يطابق التكليف', 'Assignment mismatch'],
  unlinked: ['بلا نسخة توزيع', 'No distribution version'], unpublished: ['نسخة غير منشورة', 'Unpublished version'],
  not_official: ['ليس تقييمًا مرسلًا', 'Not submitted'], not_submitted: ['مسودة أو مُعاد', 'Draft or returned'],
  invalid_score: ['علامة غير صحيحة', 'Invalid score'], missing_osce: ['الأوسكي غير مدخل', 'OSCE missing'],
  not_historical_published: ['ليس من نسخة تاريخية منشورة', 'Not a published historical mark'],
  missing_assignment: ['تكليف مفقود', 'Missing assignment'],
  period_dates_missing: ['تواريخ الفترة غير صحيحة', 'Invalid period dates'],
  grade_total_mismatch: ['مجموع الكشف لا يطابق مكوناته', 'Grade total does not match components'],
  superseded: ['محفوظ كسجل متجاوز', 'Preserved as superseded history'],
};

const statusTone = (finding: string) => finding === 'current' ? 'bg-teal-50 text-teal-800 border-teal-200'
  : finding === 'current_assessment_exists' || finding === 'not_submitted' || finding === 'missing_osce'
    ? 'bg-slate-50 text-slate-700 border-slate-200' : 'bg-amber-50 text-amber-900 border-amber-200';

function findingLabel(finding: string, ar: boolean) { return findingLabels[finding]?.[ar ? 0 : 1] ?? finding; }

export function AdminClinicalAssessmentsPage() {
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const tr = (a: string, e: string) => ar ? a : e;
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<Kind>('clinical');
  const [issuesOnly, setIssuesOnly] = useState(true);
  const [gapMode, setGapMode] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [courseId, setCourseId] = useState('');
  const [supervisorId, setSupervisorId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [subgroupId, setSubgroupId] = useState('');
  const [studentInput, setStudentInput] = useState('');
  const [student, setStudent] = useState('');
  const [week, setWeek] = useState('');
  const [version, setVersion] = useState('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<{ type: Kind; id: number } | null>(null);
  const [selectedGap, setSelectedGap] = useState<Gap | null>(null);
  const [reason, setReason] = useState('');
  const [score, setScore] = useState('');
  const [decision, setDecision] = useState<'historical_only' | 'requires_new_assessment'>('historical_only');
  const [ackApproved, setAckApproved] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  useEffect(() => { const timer = setTimeout(() => setStudent(studentInput.trim()), 350); return () => clearTimeout(timer); }, [studentInput]);
  useEffect(() => { setPage(1); }, [kind, gapMode, issuesOnly, courseId, supervisorId, groupId, subgroupId, student, week, version]);
  useEffect(() => { setSelected(null); setSelectedGap(null); setGapMode(false); setActionError(''); setActionSuccess(''); }, [kind]);

  const overview = useQuery({ queryKey: ['admin-clinical-overview'], queryFn: () => apiFetch<Overview>('/admin/clinical-assessments/overview') });
  const params = new URLSearchParams({ type: kind, page: String(page), per_page: '25', issues_only: issuesOnly ? '1' : '0', version });
  if (courseId) params.set('course_id', courseId);
  if (supervisorId && kind !== 'final_osce') params.set('supervisor_id', supervisorId);
  if (groupId && kind !== 'final_osce') params.set('group_id', groupId);
  if (subgroupId && kind !== 'final_osce') params.set('subgroup_id', subgroupId);
  if (student) params.set('student', student);
  if (week && kind !== 'final_osce') params.set('week', week);
  const list = useQuery({
    queryKey: ['admin-clinical-records', params.toString()],
    queryFn: () => apiFetch<Listing>(`/admin/clinical-assessments?${params}`),
    enabled: overview.isSuccess && !gapMode,
  });
  const gapParams = new URLSearchParams({ kind: kind === 'mini_osce' ? 'mini_osce' : 'clinical', page: String(page), per_page: '25' });
  if (courseId) gapParams.set('course_id', courseId);
  if (supervisorId) gapParams.set('supervisor_id', supervisorId);
  if (groupId) gapParams.set('group_id', groupId);
  if (subgroupId) gapParams.set('subgroup_id', subgroupId);
  if (student) gapParams.set('student', student);
  if (week) gapParams.set('week', week);
  const gaps = useQuery({
    queryKey: ['admin-clinical-gaps', gapParams.toString()],
    queryFn: () => apiFetch<GapListing>(`/admin/clinical-assessments/gaps?${gapParams}`),
    enabled: overview.isSuccess && gapMode && kind !== 'final_osce',
  });
  const detail = useQuery({
    queryKey: ['admin-clinical-detail', selected?.type, selected?.id],
    queryFn: () => apiFetch<Detail>(`/admin/clinical-assessments/${selected!.type}/${selected!.id}`),
    enabled: !!selected,
  });
  const mutate = useMutation({
    mutationFn: async (action: 'restore' | 'correct' | 'choose' | 'review' | 'resync') => {
      if (!selected || !detail.data) throw new Error('No assessment selected.');
      const body = {
        expected_updated_at: detail.data.record.updated_at,
        snapshot: detail.data.record.snapshot,
        expected_grade_updated_at: detail.data.grade?.updated_at,
        grade_snapshot: detail.data.grade?.snapshot,
        expected_current_version_id: detail.data.restore?.current_version_id,
        reason: reason.trim(), score: Number(score), decision, acknowledge_approved_grade: ackApproved,
      };
      return apiFetch(`/admin/clinical-assessments/${selected.type}/${selected.id}/${action}`, { method: 'POST', body });
    },
    onSuccess: async () => {
      setActionError(''); setActionSuccess(tr('تم الحفظ وتسجيل العملية في سجل التدقيق.', 'Saved with an audit entry.'));
      setReason(''); setAckApproved(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-clinical-overview'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-clinical-records'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-clinical-detail'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-clinical-gaps'] }),
      ]);
    },
    onError: (error: unknown) => setActionError(error instanceof ApiError ? error.message : tr('تعذّر الحفظ. حدّث السجل وافحص التعارض.', 'Could not save. Refresh and check the conflict.')),
  });
  const manualMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGap) throw new Error('No gap selected.');
      return apiFetch<{ id: number; type: string }>('/admin/clinical-assessments/manual', { method: 'POST', body: {
        assignment_id: selectedGap.assignment_id, expected_version_id: selectedGap.version_id,
        kind: selectedGap.kind,
        evaluation_week: selectedGap.kind === 'clinical' && selectedGap.assessment_kind === 'weekly' ? selectedGap.from_week : null,
        score: Number(score), reason: reason.trim(), acknowledge_approved_grade: ackApproved,
      } });
    },
    onSuccess: async result => {
      setActionError(''); setActionSuccess(tr('تم رصد العلامة إداريًا مع توثيق من أدخلها.', 'Administrative mark recorded with full attribution.'));
      setSelectedGap(null); setReason(''); setScore(''); setAckApproved(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-clinical-overview'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-clinical-records'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-clinical-gaps'] }),
      ]);
      setSelected({ type: result.type as Kind, id: result.id });
    },
    onError: (error: unknown) => setActionError(error instanceof ApiError ? error.message : tr('تعذر رصد العلامة. حدّث التكليف أولًا.', 'Could not record the mark. Refresh the assignment.')),
  });

  const open = (row: RecordRow) => { setSelected({ type: row.type, id: row.record_id }); setScore(row.score === null ? '' : String(row.score)); setDecision('historical_only'); setReason(''); setAckApproved(false); setActionError(''); setActionSuccess(''); };
  const openGap = (gap: Gap) => { setSelectedGap(gap); setScore(''); setReason(''); setAckApproved(false); setActionError(''); setActionSuccess(''); };
  const types: [Kind, string, number | undefined][] = [
    ['clinical', tr('التقييمات السريرية', 'Clinical assessments'), overview.data?.counts.clinical],
    ['mini_osce', tr('الميني أوسكي', 'Mini OSCE'), overview.data?.counts.mini_osce],
    ['final_osce', tr('الأوسكي النهائي', 'Final OSCE'), overview.data?.counts.final_osce],
  ];
  const current = detail.data?.record;
  const canCorrect = current && (current.finding === 'current' || current.finding === 'invalid_score' || current.finding === 'missing_osce' || current.finding === 'grade_total_mismatch')
    && (current.score !== null || current.type === 'final_osce')
    && (current.type !== 'clinical' || ['submitted', 'approved'].includes(current.status || ''));
  const canRestore = detail.data?.restore?.allowed && current?.type !== 'final_osce';
  const canChoose = current?.type === 'clinical' && current.finding === 'duplicate_current'
    && current.score !== null && ['submitted', 'approved'].includes(current.status || '');
  const canReview = current?.type !== 'final_osce' && current?.is_current !== null && !current?.is_current;
  const canResync = current?.type !== 'final_osce' && !!detail.data?.grade?.clinical_outdated;
  const label = (option: Option) => option.full_name_ar || option.name_ar || option.name || option.code || String(option.id);
  const field = 'h-10 min-w-0 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100';

  return <div className="min-w-0 space-y-4 pb-10" dir={ar ? 'rtl' : 'ltr'}>
    <PageHeader title={tr('إدارة سجلات التقييم السريري', 'Clinical assessment registry')} />
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-teal-100 bg-teal-50 px-4 py-3 text-sm text-teal-900">
      <span className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 shrink-0" />{tr('السجلات التاريخية لا تُحذف. كل استعادة أو تصحيح يتطلب سببًا ويظهر في التدقيق.', 'Historical records are never deleted. Every repair needs a reason and is audited.')}</span>
      <button type="button" onClick={() => { overview.refetch(); list.refetch(); detail.refetch(); }} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-white px-3 text-xs font-bold text-teal-800"><RefreshCw className="h-4 w-4" />{tr('تحديث', 'Refresh')}</button>
    </div>
    {overview.isLoading ? <LoadingState /> : overview.isError ? <ErrorState onRetry={() => overview.refetch()} /> : <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          [tr('تقييمات محفوظة على نسخ قديمة', 'Assessments on old versions'), overview.data?.counts.clinical_historical],
          [tr('ميني أوسكي تاريخي', 'Historical mini OSCE'), overview.data?.counts.mini_historical],
          [tr('جميع التقييمات', 'All assessments'), overview.data?.counts.clinical],
          [tr('أوسكي نهائي مدخل', 'Recorded final OSCE'), overview.data?.counts.final_osce],
        ].map(([name, value]) => <div key={String(name)} className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-xl font-black text-slate-900">{value ?? '—'}</div><div className="mt-1 text-xs text-slate-500">{name}</div></div>)}
      </div>
      <div role="tablist" aria-label={tr('نوع العلامات', 'Assessment type')} className="grid grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-white p-1">
        {types.map(([value, text, count]) => <button type="button" role="tab" aria-selected={kind === value} key={value} onClick={() => { setKind(value); setIssuesOnly(value !== 'final_osce'); }} className={`min-h-11 rounded-lg px-2 text-xs font-bold sm:text-sm ${kind === value ? 'bg-teal-700 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{text}<span className="ms-1 opacity-70">{count ?? ''}</span></button>)}
      </div>
      {kind !== 'final_osce' && <div role="group" aria-label={tr('نوع العرض', 'View mode')} className="inline-flex gap-1 rounded-xl border border-slate-200 bg-white p-1"><button type="button" aria-pressed={!gapMode} onClick={() => setGapMode(false)} className={`min-h-10 rounded-lg px-4 text-xs font-bold ${!gapMode ? 'bg-teal-700 text-white' : 'text-slate-600'}`}>{tr('السجلات والتعارضات', 'Records and conflicts')}</button><button type="button" aria-pressed={gapMode} onClick={() => setGapMode(true)} className={`min-h-10 rounded-lg px-4 text-xs font-bold ${gapMode ? 'bg-teal-700 text-white' : 'text-slate-600'}`}>{tr('العلامات الناقصة', 'Missing marks')}</button></div>}
      <section aria-label={tr('تصفية السجلات', 'Filter records')} className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-xs font-bold text-slate-600 sm:col-span-2 lg:col-span-1">{tr('الطالب / الرقم الجامعي', 'Student / number')}<input className={field} value={studentInput} onChange={e => setStudentInput(e.target.value)} placeholder={tr('ابحث بالاسم أو الرقم', 'Search name or number')} /></label>
          <label className="space-y-1 text-xs font-bold text-slate-600">{tr('المساق', 'Course')}<select className={field} value={courseId} onChange={e => setCourseId(e.target.value)}><option value="">{tr('كل المساقات', 'All courses')}</option>{overview.data?.courses.map(item => <option key={item.id} value={item.id}>{item.code} · {item.name_ar}</option>)}</select></label>
          {kind !== 'final_osce' && <label className="space-y-1 text-xs font-bold text-slate-600">{tr('المشرف', 'Supervisor')}<select className={field} value={supervisorId} onChange={e => setSupervisorId(e.target.value)}><option value="">{tr('كل المشرفين', 'All supervisors')}</option>{overview.data?.supervisors.map(item => <option key={item.id} value={item.id}>{label(item)}</option>)}</select></label>}
          {kind !== 'final_osce' && <label className={`${showAdvanced ? '' : 'hidden lg:block'} space-y-1 text-xs font-bold text-slate-600`}>{tr('المجموعة الرئيسية', 'Main group')}<select className={field} value={groupId} onChange={e => { setGroupId(e.target.value); setSubgroupId(''); }}><option value="">{tr('كل المجموعات', 'All groups')}</option>{overview.data?.groups.map(item => <option key={item.id} value={item.id}>{label(item)} · {item.academic_year || '—'} · {item.academic_level || '—'}</option>)}</select></label>}
          {kind !== 'final_osce' && <label className={`${showAdvanced ? '' : 'hidden lg:block'} space-y-1 text-xs font-bold text-slate-600`}>{tr('الفرعية', 'Subgroup')}<select className={field} value={subgroupId} onChange={e => setSubgroupId(e.target.value)}><option value="">{tr('الكل', 'All')}</option>{overview.data?.subgroups.filter(item => !groupId || item.student_group_id === Number(groupId)).map(item => <option key={item.id} value={item.id}>{item.group_name} · {label(item)}</option>)}</select></label>}
          {kind !== 'final_osce' && <label className={`${showAdvanced ? '' : 'hidden lg:block'} space-y-1 text-xs font-bold text-slate-600`}>{tr('الأسبوع', 'Week')}<input className={field} type="number" min="1" max="60" value={week} onChange={e => setWeek(e.target.value)} placeholder={tr('كل الأسابيع', 'All weeks')} /></label>}
          {kind !== 'final_osce' && !gapMode && <label className={`${showAdvanced ? '' : 'hidden lg:block'} space-y-1 text-xs font-bold text-slate-600`}>{tr('نسخة التوزيع', 'Distribution version')}<select className={field} value={version} onChange={e => setVersion(e.target.value)}><option value="all">{tr('الحالية والتاريخية', 'Current and historical')}</option><option value="current">{tr('الحالية فقط', 'Current only')}</option><option value="historical">{tr('التاريخية فقط', 'Historical only')}</option></select></label>}
        </div>
        {kind !== 'final_osce' && <button type="button" onClick={() => setShowAdvanced(value => !value)} className="mt-2 min-h-8 text-xs font-bold text-teal-800 lg:hidden">{showAdvanced ? tr('إخفاء التصنيفات الإضافية', 'Hide more filters') : tr('المجموعة والأسبوع وتصنيفات إضافية', 'Group, week and more filters')}</button>}
        {kind !== 'final_osce' && !gapMode && <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={issuesOnly} onChange={e => setIssuesOnly(e.target.checked)} className="h-4 w-4 accent-teal-700" />{tr('أظهر السجلات التي تحتاج فحصًا فقط', 'Show records needing review only')}</label>}
      </section>
      {gapMode && kind !== 'final_osce' ? (gaps.isLoading ? <LoadingState /> : gaps.isError ? <ErrorState onRetry={() => gaps.refetch()} /> : <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 text-xs text-slate-500"><span>{gaps.data?.pagination.total ?? 0} {tr('علامة ناقصة بعد انتهاء فترة التقييم', 'marks missing after the assessment period ended')}</span><span>{tr('الإدخال الإداري استثناء ويتطلب مستندًا أو قرارًا موثقًا.', 'Administrative entry is exceptional and requires documented evidence.')}</span></div>
        {!gaps.data?.items.length ? <div className="px-4 py-10 text-center text-sm text-slate-500">{tr('لا توجد علامات ناقصة مطابقة لهذه التصفية.', 'No missing marks match these filters.')}</div> : <div className="grid gap-2 p-2 sm:grid-cols-2 xl:grid-cols-3">{gaps.data.items.map(gap => <article key={`${gap.kind}:${gap.assignment_id}:${gap.from_week}`} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start justify-between gap-2"><div className="font-black text-slate-900">{gap.student_name}</div><span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-800">{tr('غير مدخل', 'Missing')}</span></div><div dir="ltr" className="text-xs text-slate-500">{gap.university_number}</div><div className="mt-2 text-xs text-slate-700">{gap.course_code} · {gap.group_name || '—'} {gap.subgroup_name || ''} · {gap.supervisor_name}</div><div className="mt-1 text-xs text-slate-500">{gap.assessment_kind === 'period' || gap.kind === 'mini_osce' ? tr('فترة', 'Period') : tr('أسبوع', 'Week')} {gap.from_week}{gap.to_week !== gap.from_week ? `–${gap.to_week}` : ''} · / {gap.max_score}</div><button type="button" onClick={() => openGap(gap)} className="mt-3 min-h-9 rounded-lg border border-teal-200 bg-teal-50 px-3 text-xs font-bold text-teal-800">{tr('فحص ورصد إداري', 'Inspect and enter')}</button></article>)}</div>}
        <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2"><button type="button" disabled={(gaps.data?.pagination.current_page ?? 1) <= 1} onClick={() => setPage(p => p - 1)} className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-40">{tr('السابق', 'Previous')}</button><span className="text-xs text-slate-500">{gaps.data?.pagination.current_page} / {gaps.data?.pagination.last_page}</span><button type="button" disabled={(gaps.data?.pagination.current_page ?? 1) >= (gaps.data?.pagination.last_page ?? 1)} onClick={() => setPage(p => p + 1)} className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-40">{tr('التالي', 'Next')}</button></div>
      </section>) : (list.isLoading ? <LoadingState /> : list.isError ? <ErrorState onRetry={() => list.refetch()} /> : <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 text-xs text-slate-500"><span>{list.data?.pagination.total ?? 0} {tr('سجل مطابق', 'matching records')}</span><span>{tr('اضغط على السجل لفحصه وتصحيحه', 'Select a record to inspect or repair')}</span></div>
        {!list.data?.items.length ? <div className="px-4 py-10 text-center text-sm text-slate-500">{tr('لا توجد سجلات مطابقة لهذه التصفية.', 'No records match these filters.')}</div> : <>
          <div className="space-y-2 p-2 md:hidden">{list.data.items.map(row => <RecordCard key={row.record_id} row={row} ar={ar} onClick={() => open(row)} />)}</div>
          <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[850px] text-start text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3 text-start">{tr('الطالب', 'Student')}</th><th className="px-4 py-3 text-start">{tr('المساق / المجموعة', 'Course / group')}</th><th className="px-4 py-3 text-start">{tr('المشرف / الموعد', 'Supervisor / slot')}</th><th className="px-4 py-3 text-start">{tr('العلامة', 'Score')}</th><th className="px-4 py-3 text-start">{tr('الحالة', 'Finding')}</th><th className="px-4 py-3 text-start">{tr('النسخة', 'Version')}</th></tr></thead><tbody className="divide-y divide-slate-100">{list.data.items.map(row => <tr key={row.record_id} onClick={() => open(row)} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') open(row); }} className="cursor-pointer hover:bg-teal-50 focus:bg-teal-50"><td className="px-4 py-3 font-bold text-slate-900">{row.student_name}<div className="text-[11px] font-normal text-slate-500" dir="ltr">{row.university_number}</div></td><td className="px-4 py-3 text-slate-700">{row.course_code} · {row.course_name}<div className="text-xs text-slate-500">{row.group_name || '—'} {row.subgroup_name || ''}</div></td><td className="px-4 py-3 text-slate-700">{row.supervisor_name || '—'}<div className="text-xs text-slate-500">{slot(row, ar)}</div></td><td className="px-4 py-3 font-bold" dir="ltr">{row.score ?? '—'}{row.max_score ? ` / ${row.max_score}` : ''}</td><td className="px-4 py-3"><Finding finding={row.finding} ar={ar} /></td><td className="px-4 py-3 text-xs text-slate-500" dir="ltr">{row.version_id ?? '—'}</td></tr>)}</tbody></table></div>
          <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2"><button type="button" disabled={(list.data?.pagination.current_page ?? 1) <= 1} onClick={() => setPage(p => p - 1)} className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-40"><ChevronRight className="inline h-4 w-4" />{tr('السابق', 'Previous')}</button><span className="text-xs text-slate-500">{list.data?.pagination.current_page} / {list.data?.pagination.last_page}</span><button type="button" disabled={(list.data?.pagination.current_page ?? 1) >= (list.data?.pagination.last_page ?? 1)} onClick={() => setPage(p => p + 1)} className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-40">{tr('التالي', 'Next')}<ChevronLeft className="inline h-4 w-4" /></button></div>
        </>}
      </section>)}
    </>}
    {selectedGap && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) setSelectedGap(null); }}><section role="dialog" aria-modal="true" aria-label={tr('رصد علامة ناقصة', 'Enter missing mark')} className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl sm:rounded-2xl sm:p-5"><div className="flex items-center justify-between"><h2 className="text-base font-black">{tr('رصد علامة ناقصة إداريًا', 'Administrative entry of missing mark')}</h2><button type="button" aria-label={tr('إغلاق', 'Close')} onClick={() => setSelectedGap(null)} className="rounded-lg p-2 text-slate-500"><X className="h-5 w-5" /></button></div><div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm"><strong>{selectedGap.student_name}</strong> · {selectedGap.course_code}<div className="mt-1 text-xs text-slate-600">{selectedGap.supervisor_name} · {selectedGap.group_name || '—'} {selectedGap.subgroup_name || ''} · {selectedGap.from_week}–{selectedGap.to_week}</div></div><p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{tr('ستظهر العلامة باسم المشرف المكلف، لكن سجل التدقيق يوضح أنك أدخلتها أنت. افحص المستند أو قرار التصحيح قبل الحفظ.', 'The mark is attributed to the assigned supervisor, while the audit explicitly records your administrative entry. Verify supporting evidence first.')}</p><div className="mt-3 space-y-3"><label className="block space-y-1 text-xs font-bold">{tr('العلامة', 'Score')} / {selectedGap.max_score}<input type="number" min="0" max={Number(selectedGap.max_score)} step="0.01" className={field} value={score} onChange={e => setScore(e.target.value)} /></label><label className="block space-y-1 text-xs font-bold">{tr('المستند أو سبب التصحيح (إلزامي)', 'Evidence or correction reason (required)')}<textarea className={`${field} min-h-24 py-2`} value={reason} onChange={e => setReason(e.target.value)} /></label><label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900"><input type="checkbox" checked={ackApproved} onChange={e => setAckApproved(e.target.checked)} className="mt-0.5 h-4 w-4 accent-amber-700" />{tr('إذا كان كشف الطالب معتمدًا، أوافق على تعديل مجموع العلامات المعتمدة مع تسجيل ذلك.', 'If this student has an approved grade sheet, I authorize recalculation with an audit trail.')}</label>{actionError && <p role="alert" className="text-xs text-red-700">{actionError}</p>}<button type="button" disabled={manualMutation.isPending || reason.trim().length < 10 || score === '' || Number(score) < 0 || Number(score) > Number(selectedGap.max_score)} onClick={() => { if (window.confirm(tr('تأكيد رصد العلامة نيابة عن المشرف المكلف؟', 'Confirm administrative entry on behalf of the assigned supervisor?'))) manualMutation.mutate(); }} className="min-h-10 w-full rounded-lg bg-teal-700 px-4 text-xs font-bold text-white disabled:opacity-40">{tr('حفظ العلامة مع التدقيق', 'Save with audit')}</button></div></section></div>}
    {selected && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) setSelected(null); }}>
      <section role="dialog" aria-modal="true" aria-label={tr('تفاصيل التقييم', 'Assessment detail')} className="flex max-h-[95dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90dvh] sm:rounded-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><h2 className="flex items-center gap-2 text-base font-black text-slate-900"><ClipboardList className="h-5 w-5 text-teal-700" />{tr('فحص سجل التقييم', 'Inspect assessment')} #{selected.id}</h2><button type="button" aria-label={tr('إغلاق', 'Close')} onClick={() => setSelected(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></header>
        <div className="overflow-y-auto p-4 sm:p-5">
          {detail.isLoading ? <LoadingState /> : detail.isError ? <ErrorState onRetry={() => detail.refetch()} /> : current && <div className="space-y-4">
            <div className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2"><div><div className="text-xs text-slate-500">{tr('الطالب', 'Student')}</div><div className="font-bold">{current.student_name} · {current.university_number}</div></div><div><div className="text-xs text-slate-500">{tr('المساق والمجموعة', 'Course and group')}</div><div className="font-bold">{current.course_code} · {current.group_name || '—'} {current.subgroup_name || ''}</div></div><div><div className="text-xs text-slate-500">{tr('المشرف والموعد', 'Supervisor and slot')}</div><div className="font-bold">{current.supervisor_name || '—'} · {slot(current, ar)}</div></div><div><div className="text-xs text-slate-500">{tr('العلامة والنسخة', 'Score and version')}</div><div className="font-bold" dir="ltr">{current.score ?? '—'}{current.max_score ? ` / ${current.max_score}` : ''} · v{current.version_id ?? '—'}</div></div><div className="sm:col-span-2"><Finding finding={current.finding} ar={ar} /></div></div>
            {detail.data?.grade && <div className="rounded-xl border border-slate-200 p-3 text-xs"><b>{tr('كشف العلامات', 'Grade sheet')}:</b> {detail.data.grade.status} · {tr('السريري', 'Clinical')} {detail.data.grade.clinical_score ?? '—'} · OSCE {detail.data.grade.osce_score ?? '—'} · {tr('المجموع', 'Total')} {detail.data.grade.total_score ?? '—'}{detail.data.grade.clinical_outdated && <div className="mt-2 rounded-lg bg-amber-50 p-2 font-bold text-amber-900">{tr('العلامة السريرية في الكشف لا تطابق المحسوبة من التقييمات الحالية:', 'Saved clinical grade differs from current assessments:')} {detail.data.grade.official_clinical_score}</div>}</div>}
            {detail.data?.peers && detail.data.peers.length > 1 && <section className="rounded-xl border border-amber-200 bg-amber-50 p-3"><h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-amber-900"><AlertTriangle className="h-4 w-4" />{tr('سجلات أخرى لنفس الطالب والموعد', 'Other records for this student and slot')}</h3><div className="space-y-2">{detail.data.peers.map(peer => <div key={peer.record_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-xs"><span>#{peer.record_id} · {peer.supervisor_name || '—'} · v{peer.version_id ?? '—'}</span><strong dir="ltr">{peer.score ?? '—'} / {peer.max_score ?? '—'}</strong><Finding finding={peer.finding} ar={ar} /></div>)}</div></section>}
            {detail.data?.restore && !detail.data.restore.allowed && current.finding !== 'current' && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{tr('الاستعادة المباشرة موقوفة: ', 'Automatic restore blocked: ')}{findingLabel(detail.data.restore.reason || '', ar)}. {tr('افحص التكليف والعلامة الحالية قبل اتخاذ قرار أكاديمي.', 'Inspect assignment and current score before an academic decision.')}</div>}
            {(canRestore || canCorrect || canChoose || canReview || canResync) && <section className="space-y-3 rounded-xl border border-teal-200 bg-teal-50/50 p-3 sm:p-4"><h3 className="text-sm font-black text-teal-900">{tr('إجراء إداري موثّق', 'Audited administrative action')}</h3>
              {canCorrect && <label className="block space-y-1 text-xs font-bold text-slate-700">{tr('العلامة المصححة', 'Corrected score')}<input type="number" min="0" max={current.max_score ? Number(current.max_score) : undefined} step="0.01" className={field} value={score} onChange={e => setScore(e.target.value)} /></label>}
              {canCorrect && current.type === 'clinical' && <p className="text-[11px] text-slate-600">{tr('إذا كان للتقييم تفصيل معايير سابق، سيُحفظ في سجل التدقيق ويُزال من السجل الحالي حتى لا يتناقض مع العلامة المصححة.', 'Any previous criteria breakdown is preserved in the audit and cleared from the current record so it cannot contradict the corrected total.')}</p>}
              <label className="block space-y-1 text-xs font-bold text-slate-700">{tr('سبب مفصل (إلزامي، 10 أحرف على الأقل)', 'Detailed reason (required, at least 10 characters)')}<textarea className={`${field} min-h-20 py-2`} value={reason} onChange={e => setReason(e.target.value)} placeholder={tr('مثال: مطابقة سجل المشرف مع التكليف الحالي ومراجعة العلامة...', 'Describe evidence and academic decision...')} /></label>
              {detail.data?.grade?.status === 'approved' && <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900"><input type="checkbox" checked={ackApproved} onChange={e => setAckApproved(e.target.checked)} className="mt-0.5 h-4 w-4 accent-amber-700" />{tr('أؤكد تعديل كشف معتمد وإعادة حساب مجموع الطالب مع حفظ الأثر في سجل التدقيق.', 'I confirm amendment of an approved grade sheet and recalculation of this student’s total, with full audit.')}</label>}
              {canReview && <label className="block space-y-1 text-xs font-bold text-slate-700">{tr('قرار مراجعة السجل التاريخي', 'Historical review decision')}<select className={field} value={decision} onChange={e => setDecision(e.target.value as typeof decision)}><option value="historical_only">{tr('حفظه كسجل تاريخي فقط؛ لا يدخل في العلامة الحالية', 'Keep as historical evidence only')}</option><option value="requires_new_assessment">{tr('يلزم تقييم جديد من المشرف المكلف حاليًا', 'Current supervisor must submit a new assessment')}</option></select></label>}
              {actionError && <p role="alert" className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{actionError}</p>}{actionSuccess && <p role="status" className="rounded-lg bg-teal-100 p-2 text-xs text-teal-900">{actionSuccess}</p>}
              <div className="flex flex-wrap gap-2">{canRestore && <button type="button" disabled={mutate.isPending || reason.trim().length < 10 || (detail.data?.grade?.status === 'approved' && !ackApproved)} onClick={() => { if (window.confirm(tr('تأكيد استعادة العلامة إلى التكليف الحالي؟', 'Restore this mark to the current assignment?'))) mutate.mutate('restore'); }} className="min-h-10 rounded-lg bg-teal-700 px-4 text-xs font-bold text-white disabled:opacity-40">{tr('استعادة العلامة للنسخة الحالية', 'Restore to current version')}</button>}{canCorrect && <button type="button" disabled={mutate.isPending || reason.trim().length < 10 || score === '' || Number(score) < 0 || Number(score) > Number(current.max_score ?? 100) || (detail.data?.grade?.status === 'approved' && !ackApproved)} onClick={() => { if (window.confirm(tr('تأكيد تصحيح العلامة وتحديث كشف الطالب؟', 'Correct this score and update the grade sheet?'))) mutate.mutate('correct'); }} className="min-h-10 rounded-lg border border-teal-700 bg-white px-4 text-xs font-bold text-teal-800 disabled:opacity-40">{tr('تصحيح العلامة', 'Correct score')}</button>}{canChoose && <button type="button" disabled={mutate.isPending || reason.trim().length < 10 || (detail.data?.grade?.status === 'approved' && !ackApproved)} onClick={() => { if (window.confirm(tr('سيُعتمد هذا السجل وتُحفظ العلامات الأخرى كسجلات متجاوزة. تأكيد؟', 'Choose this mark; preserve peers as superseded. Confirm?'))) mutate.mutate('choose'); }} className="min-h-10 rounded-lg bg-amber-700 px-4 text-xs font-bold text-white disabled:opacity-40">{tr('اعتماد هذه العلامة وحسم التكرار', 'Choose this authoritative mark')}</button>}{canResync && <button type="button" disabled={mutate.isPending || reason.trim().length < 10 || (detail.data?.grade?.status === 'approved' && !ackApproved)} onClick={() => { if (window.confirm(tr('تأكيد إعادة حساب العلامة السريرية في الكشف من التقييمات الحالية؟', 'Recalculate saved clinical grade from current assessments?'))) mutate.mutate('resync'); }} className="min-h-10 rounded-lg border border-amber-300 bg-amber-50 px-4 text-xs font-bold text-amber-900 disabled:opacity-40">{tr('مزامنة كشف العلامات', 'Synchronize grade sheet')}</button>}{canReview && <button type="button" disabled={mutate.isPending || reason.trim().length < 10} onClick={() => mutate.mutate('review')} className="min-h-10 rounded-lg border border-slate-300 bg-white px-4 text-xs font-bold text-slate-700 disabled:opacity-40">{tr('توثيق القرار دون تغيير العلامة', 'Document decision without changing score')}</button>}</div>
            </section>}
            <section className="space-y-2"><h3 className="text-sm font-black text-slate-900">{tr('سجل التدقيق', 'Audit history')}</h3>{detail.data?.audits.length ? detail.data.audits.map(log => <div key={log.id} className="rounded-lg border border-slate-200 p-3 text-xs"><div className="font-bold">{log.action} · {log.actor || '—'} · {new Date(log.created_at).toLocaleString(ar ? 'ar-PS' : 'en-GB')}</div>{log.reason && <div className="mt-1 text-slate-600">{log.reason}</div>}<details className="mt-1 text-slate-500"><summary className="cursor-pointer">{tr('تفاصيل التغيير', 'Change details')}</summary><pre className="mt-2 overflow-auto whitespace-pre-wrap" dir="ltr">{JSON.stringify(log.changes, null, 2)}</pre></details></div>) : <p className="text-xs text-slate-500">{tr('لا توجد عمليات تصحيح إدارية لهذا السجل.', 'No administrative corrections for this record.')}</p>}</section>
          </div>}
        </div>
      </section>
    </div>}
  </div>;
}

function slot(row: RecordRow, ar: boolean) {
  if (row.type === 'final_osce') return ar ? 'الأوسكي النهائي' : 'Final OSCE';
  if (row.type === 'mini_osce') return `${ar ? 'فترة' : 'Period'} ${row.from_week ?? '—'}–${row.to_week ?? '—'}`;
  if (row.assessment_kind === 'period') return ar ? 'فترة التدريب' : 'Training period';
  return `${ar ? 'الأسبوع' : 'Week'} ${row.evaluation_week ?? '—'}`;
}

function Finding({ finding, ar }: { finding: string; ar: boolean }) {
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-bold ${statusTone(finding)}`}>{finding === 'current' ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}{findingLabel(finding, ar)}</span>;
}

function RecordCard({ row, ar, onClick }: { row: RecordRow; ar: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="w-full rounded-xl border border-slate-200 p-3 text-start transition hover:border-teal-300 hover:bg-teal-50"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="font-black text-slate-900">{row.student_name}</div><div className="text-xs text-slate-500" dir="ltr">{row.university_number}</div></div><strong className="shrink-0 text-sm text-teal-800" dir="ltr">{row.score ?? '—'}{row.max_score ? ` / ${row.max_score}` : ''}</strong></div><div className="mt-2 text-xs font-semibold text-slate-700">{row.course_code} · {row.group_name || '—'} {row.subgroup_name || ''} · {slot(row, ar)}</div><div className="mt-1 text-xs text-slate-500">{row.supervisor_name || '—'} · v{row.version_id ?? '—'}</div><div className="mt-2"><Finding finding={row.finding} ar={ar} /></div></button>;
}
