import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Search, Settings2 } from 'lucide-react';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';

type Named = { id: number; code?: string; name_ar?: string; name_en?: string | null };
type Person = { id: number; full_name_ar: string; full_name_en?: string | null };
type Student = { id: number; university_number: string; full_name_ar: string; full_name_en?: string | null };
type ReviewSubgroup = { assignment_id: number; name: string | null; student_count: number; week_count: number };
type ReviewGroup = {
  key: string; academic_year: Named | null; course: Named | null; clinical_period?: Named | null; rotation_code?: string | null; group_name: string | null;
  academic_level: string | null; batch_year: number | null; student_count: number; subgroups: ReviewSubgroup[];
};
type ReviewAssessment = {
  id: number; status: string; score: string | number | null; max_score: string | number;
  notes: string | null; submitted_at: string | null; evaluator: Person | null;
};
type ReviewStudent = { student: Student; supervisors: Person[]; assessments: ReviewAssessment[]; ready: boolean };
type ReviewWeek = {
  number: number; start_date: string | null; end_date: string | null;
  student_count: number; ready_count: number; students: ReviewStudent[];
};
type ReviewDetail = {
  assignment_id: number; academic_year: Named | null; course: Named | null; clinical_period?: Named | null; rotation_code?: string | null; group_name: string | null;
  subgroup_name: string | null; batch_year: number | null; student_count: number; weeks: ReviewWeek[];
};

const inputClass = 'h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100';
const dateLabel = (value: string | null, ar: boolean) => value
  ? new Intl.DateTimeFormat(ar ? 'ar-PS' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${value.slice(0, 10)}T12:00:00`))
  : '—';
const personName = (person: Person | null, ar: boolean) => person ? (ar ? person.full_name_ar : person.full_name_en || person.full_name_ar) : '—';
const courseName = (course: Named | null, ar: boolean) => course ? (ar ? course.name_ar : course.name_en || course.name_ar) || course.code || '—' : '—';

export function AssessmentsMasterPage() {
  const { can } = useAuth();
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const tr = (arabic: string, english: string) => ar ? arabic : english;
  const [search, setSearch] = useState('');
  const [groupKey, setGroupKey] = useState('');
  const [selectedAssignmentId, setSelectedAssignmentId] = useState(0);
  const allowed = can('assessment.review');

  const groupsQuery = useQuery({
    queryKey: ['clinical-assessment-review-groups'],
    queryFn: () => apiFetch<{ groups: ReviewGroup[] }>('/clinical-assessments/review-groups'),
    enabled: allowed,
  });
  const groups = groupsQuery.data?.groups ?? [];
  const visibleGroups = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return groups;
    return groups.filter(group => [
      group.academic_year?.code, group.course?.code, group.course?.name_ar, group.course?.name_en,
      group.clinical_period?.code, group.clinical_period?.name_ar, group.rotation_code,
      group.group_name, group.batch_year, ...group.subgroups.map(subgroup => subgroup.name),
    ].some(value => String(value ?? '').toLocaleLowerCase().includes(term)));
  }, [groups, search]);
  const selectedGroup = visibleGroups.find(group => group.key === groupKey) ?? visibleGroups[0] ?? null;
  const assignmentId = selectedGroup?.subgroups.some(subgroup => subgroup.assignment_id === selectedAssignmentId)
    ? selectedAssignmentId : selectedGroup?.subgroups[0]?.assignment_id ?? 0;

  const detailQuery = useQuery({
    queryKey: ['clinical-assessment-review-subgroup', assignmentId],
    queryFn: () => apiFetch<ReviewDetail>(`/clinical-assessments/review-subgroup?assignment_id=${assignmentId}`),
    enabled: allowed && assignmentId > 0,
  });
  const detail = detailQuery.data;
  const expected = detail?.weeks.reduce((total, week) => total + week.student_count, 0) ?? 0;
  const ready = detail?.weeks.reduce((total, week) => total + week.ready_count, 0) ?? 0;
  const today = new Date().toISOString().slice(0, 10);
  const defaultWeek = [...(detail?.weeks ?? [])].reverse().find(week => week.start_date && week.start_date <= today)?.number
    ?? detail?.weeks[0]?.number;

  if (!allowed) return <ErrorState title={tr('لا تملك صلاحية مراجعة التقييمات', 'You do not have permission to review assessments')} />;
  if (groupsQuery.isLoading) return <LoadingState />;
  if (groupsQuery.isError) return <ErrorState onRetry={() => groupsQuery.refetch()} />;

  return <div className="mx-auto w-full max-w-5xl space-y-4 pb-12">
    <PageHeader title={tr('مراجعة التقييمات السريرية', 'Clinical assessment review')} description={tr(
      'اختر المجموعة الفرعية لمراجعة تقييمات طلبتها في جميع أسابيع التكليف. التقييمات المرسلة تدخل كشف العلامات مباشرة.',
      'Choose a subgroup to review its students across every assigned week. Submitted assessments feed the grade sheet directly.',
    )}>
      {can('assessment.criteria.manage') && <Link to="/assessments/criteria" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-teal-200 bg-white px-3 text-xs font-bold text-teal-800"><Settings2 className="h-4 w-4" />{tr('نموذج التقييم', 'Assessment template')}</Link>}
    </PageHeader>

    {!groups.length ? <EmptyState message={tr('لا توجد مجموعات في توزيع سريري منشور ضمن السنوات المكلّف بها.', 'No groups exist in a published clinical distribution within your assigned cohorts.')} /> : <>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-sm font-black text-slate-900">{tr('نطاق المراجعة', 'Review scope')}</h2><span className="text-[11px] font-bold text-slate-500">{groups.length} {tr('مجموعة', 'groups')}</span></div>
        <label className="relative block"><span className="sr-only">{tr('ابحث عن مجموعة', 'Search groups')}</span><Search className={`absolute top-3.5 h-4 w-4 text-slate-400 ${ar ? 'right-3' : 'left-3'}`} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder={tr('ابحث بالمساق أو المجموعة أو الدفعة', 'Search course, group, or cohort')} className={`${inputClass} ${ar ? 'pr-10' : 'pl-10'}`} /></label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block min-w-0 text-[11px] font-black text-slate-600"><span className="mb-1.5 block">{tr('المجموعة', 'Group')}</span><select aria-label={tr('المجموعة', 'Group')} value={selectedGroup?.key ?? ''} onChange={event => setGroupKey(event.target.value)} disabled={!visibleGroups.length} className={inputClass}>{visibleGroups.length ? visibleGroups.map(group => <option key={group.key} value={group.key}>{courseName(group.course, ar)} · {group.group_name || tr('دون مجموعة', 'Ungrouped')} · {group.academic_year?.code || '—'}{group.clinical_period?.code ? ` · ${group.clinical_period.code}` : ''}{group.rotation_code ? ` · ${group.rotation_code}` : ''}{group.batch_year ? ` · ${tr('دفعة', 'Cohort')} ${group.batch_year}` : ''}</option>) : <option value="">{tr('لا توجد نتائج', 'No matches')}</option>}</select></label>
          <label className="block min-w-0 text-[11px] font-black text-slate-600"><span className="mb-1.5 block">{tr('المجموعة الفرعية', 'Subgroup')}</span><select aria-label={tr('المجموعة الفرعية', 'Subgroup')} value={assignmentId || ''} onChange={event => setSelectedAssignmentId(Number(event.target.value))} disabled={!selectedGroup?.subgroups.length} className={inputClass}>{selectedGroup?.subgroups.map(subgroup => <option key={subgroup.assignment_id} value={subgroup.assignment_id}>{subgroup.name || tr('دون مجموعة فرعية', 'No subgroup')} · {subgroup.student_count} {tr('طلاب', 'students')} · {subgroup.week_count} {tr('أسابيع', 'weeks')}</option>)}</select></label>
        </div>
      </section>

      {!visibleGroups.length ? <EmptyState message={tr('لا توجد مجموعات تطابق البحث.', 'No groups match your search.')} /> : detailQuery.isError ? <ErrorState onRetry={() => detailQuery.refetch()} /> : !assignmentId || detailQuery.isLoading || !detail ? <LoadingState /> : <>
        <section className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs shadow-sm">
          <div className="min-w-0"><h2 className="font-black text-slate-900">{detail.group_name || tr('دون مجموعة', 'Ungrouped')} · {detail.subgroup_name || tr('دون مجموعة فرعية', 'No subgroup')}</h2><p className="mt-1 text-[11px] text-slate-500">{courseName(detail.course, ar)} · {detail.student_count} {tr('طلاب', 'students')} · {detail.weeks.length} {tr('أسابيع', 'weeks')}</p></div>
          <p className="font-black text-teal-800">{ready} / {expected} {tr('تقييمات مرسلة', 'submitted assessments')}</p>
        </section>

        {!detail.weeks.length ? <EmptyState message={tr('لا توجد أسابيع تكليف لهذه المجموعة الفرعية.', 'This subgroup has no assigned weeks.')} /> : <section aria-label={tr('تقييمات جميع الأسابيع', 'Assessments for all weeks')} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {detail.weeks.map(week => <details key={`${assignmentId}-${week.number}`} open={week.number === defaultWeek} className="group border-b border-slate-100 last:border-b-0">
            <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:hidden sm:px-5">
              <span className="min-w-0"><strong className="block text-sm text-slate-900">{tr(`الأسبوع ${week.number}`, `Week ${week.number}`)}</strong><small className="mt-0.5 block text-[11px] text-slate-500" dir="ltr">{dateLabel(week.start_date, ar)} — {dateLabel(week.end_date, ar)}</small></span>
              <span className="flex shrink-0 items-center gap-2"><span className="text-xs font-black text-teal-800">{week.ready_count}/{week.student_count}</span><ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" /></span>
            </summary>
            <div className="border-t border-slate-100 bg-slate-50/40">
              {!week.students.length ? <p className="px-4 py-5 text-xs text-slate-500">{tr('لا يوجد طلبة مكلّفون في هذا الأسبوع.', 'No students are assigned this week.')}</p> : <div className="divide-y divide-slate-100">{week.students.map(row => <StudentAssessmentRow key={row.student.id} row={row} ar={ar} />)}</div>}
            </div>
          </details>)}
        </section>}
      </>}
    </>}
  </div>;
}

function StudentAssessmentRow({ row, ar }: { row: ReviewStudent; ar: boolean }) {
  const tr = (arabic: string, english: string) => ar ? arabic : english;
  const name = ar ? row.student.full_name_ar : row.student.full_name_en || row.student.full_name_ar;

  return <article className="bg-white px-4 py-3 sm:px-5">
    <div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-xs font-black text-slate-900">{name}</h3><p dir="ltr" className="mt-0.5 text-start text-[10px] text-slate-500">{row.student.university_number}</p></div><span className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold ${row.ready ? 'bg-teal-50 text-teal-800' : 'bg-slate-100 text-slate-600'}`}>{row.ready ? tr('مرسل', 'Submitted') : row.assessments.length ? tr('غير مرسل', 'Not submitted') : tr('بانتظار التقييم', 'Awaiting assessment')}</span></div>
    {!row.assessments.length ? <p className="mt-2 text-[11px] leading-5 text-slate-500">{tr('لم يصل تقييم بعد', 'No assessment received yet')}{row.supervisors.length ? ` · ${row.supervisors.map(person => personName(person, ar)).join('، ')}` : ''}</p> : <div className="mt-2 space-y-1.5">{row.assessments.map(assessment => <div key={assessment.id} className="min-w-0 rounded-lg bg-slate-50 px-3 py-2 text-[11px]">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1"><span className="min-w-0 break-words text-slate-600">{personName(assessment.evaluator, ar)}</span><span className="flex shrink-0 items-center gap-2"><b dir="ltr" className="text-xs text-slate-900">{assessment.score === null ? '—' : Number(assessment.score).toFixed(1)} / {Number(assessment.max_score).toFixed(0)}</b><span className={assessment.status === 'returned' ? 'font-bold text-amber-700' : assessment.status === 'draft' ? 'font-bold text-slate-500' : 'font-bold text-teal-800'}>{statusLabel(assessment.status, ar)}</span></span></div>
      {assessment.notes && <details className="mt-1 text-slate-600"><summary className="cursor-pointer font-bold text-teal-800">{tr('ملاحظة المشرف', 'Supervisor note')}</summary><p className="mt-1 whitespace-pre-wrap leading-5">{assessment.notes}</p></details>}
    </div>)}</div>}
  </article>;
}

function statusLabel(status: string, ar: boolean): string {
  const labels: Record<string, [string, string]> = {
    submitted: ['مرسل', 'Submitted'], approved: ['معتمد', 'Approved'],
    returned: ['معاد', 'Returned'], draft: ['مسودة', 'Draft'],
  };
  const value = labels[status] ?? labels.draft;
  return ar ? value[0] : value[1];
}
