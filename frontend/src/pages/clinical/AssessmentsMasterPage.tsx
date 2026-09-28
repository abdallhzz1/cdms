import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Settings2 } from 'lucide-react';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { ProfilePhotoLightbox } from '@/components/ui/ProfilePhotoLightbox';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';

type Named = { id: number; code?: string; name_ar?: string; name_en?: string | null };
type Person = { id: number; full_name_ar: string; full_name_en?: string | null };
type Student = { id: number; university_number: string; full_name_ar: string; full_name_en?: string | null; photo_url?: string | null };
type ReviewSubgroup = { id: number; name: string; student_count: number; week_count: number; students: Student[] };
type ReviewGroup = { key: string; academic_year: Named | null; group_name: string; academic_level: string | null; student_count: number; subgroups: ReviewSubgroup[] };
type ReviewAssessment = { id: number; status: string; score: string | number | null; max_score: string | number; notes: string | null; evaluator: Person | null };
type ReviewStudent = { student: Student; supervisors: Person[]; assessments: ReviewAssessment[]; ready: boolean };
type ReviewWeek = { number: number; start_date: string | null; end_date: string | null; student_count: number; ready_count: number; students: ReviewStudent[] };
type ReviewRotation = { id: number; course: Named | null; clinical_period: Named | null; weeks: ReviewWeek[] };
type ReviewDetail = { subgroup_id: number; rotations: ReviewRotation[] };

const dateLabel = (value: string | null, ar: boolean) => value
  ? new Intl.DateTimeFormat(ar ? 'ar-PS' : 'en-GB', { day: '2-digit', month: '2-digit' }).format(new Date(`${value.slice(0, 10)}T12:00:00`))
  : '—';
const personName = (person: Person | null, ar: boolean) => person ? (ar ? person.full_name_ar : person.full_name_en || person.full_name_ar) : '—';
const courseName = (course: Named | null, ar: boolean) => course ? (ar ? course.name_ar : course.name_en || course.name_ar) || course.code || '—' : '—';
const studentName = (student: Student, ar: boolean) => ar ? student.full_name_ar : student.full_name_en || student.full_name_ar;
const levelName = (level: string | null, ar: boolean) => ({ fourth: ar ? 'السنة الرابعة' : 'Fourth year', fifth: ar ? 'السنة الخامسة' : 'Fifth year', sixth: ar ? 'السنة السادسة' : 'Sixth year' }[level || ''] || level || '');

export function AssessmentsMasterPage() {
  const { can } = useAuth();
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const tr = (arabic: string, english: string) => ar ? arabic : english;
  const [groupKey, setGroupKey] = useState('');
  const [openedSubgroupId, setOpenedSubgroupId] = useState<number | null>(null);
  const allowed = can('assessment.review');
  const groupsQuery = useQuery({
    queryKey: ['clinical-assessment-review-groups'],
    queryFn: () => apiFetch<{ groups: ReviewGroup[] }>('/clinical-assessments/review-groups'),
    enabled: allowed,
  });
  const groups = groupsQuery.data?.groups ?? [];
  const selectedGroup = groups.find(group => group.key === groupKey) ?? groups[0] ?? null;
  const activeSubgroupId = selectedGroup?.subgroups.some(subgroup => subgroup.id === openedSubgroupId)
    ? openedSubgroupId : openedSubgroupId === -1 ? -1 : selectedGroup?.subgroups[0]?.id ?? -1;

  if (!allowed) return <ErrorState title={tr('لا تملك صلاحية مراجعة التقييمات', 'You do not have permission to review assessments')} />;
  if (groupsQuery.isLoading) return <LoadingState />;
  if (groupsQuery.isError) return <ErrorState onRetry={() => groupsQuery.refetch()} />;

  return <div className="mx-auto w-full max-w-6xl space-y-4 pb-12">
    <PageHeader title={tr('مراجعة التقييمات السريرية', 'Clinical assessment review')} description={tr('المجموعات الفرعية وطلبتها، ثم تقييم كل أسبوع في مكان واحد.', 'Subgroups and their students, followed by every assessment week in one place.')}>
      {can('assessment.criteria.manage') && <Link to="/assessments/criteria" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-teal-200 bg-white px-3 text-xs font-bold text-teal-800"><Settings2 className="h-4 w-4" />{tr('نموذج التقييم', 'Assessment template')}</Link>}
    </PageHeader>
    {!groups.length ? <EmptyState message={tr('لا توجد مجموعات في توزيع سريري منشور ضمن السنوات المكلّف بها.', 'No groups exist in a published clinical distribution within your assigned cohorts.')} /> : <>
      <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
        <label htmlFor="assessment-main-group" className="mb-2 block text-xs font-black text-slate-600">{tr('المجموعة الرئيسية', 'Main group')}</label>
        <select id="assessment-main-group" value={selectedGroup?.key ?? ''} onChange={event => { setGroupKey(event.target.value); setOpenedSubgroupId(null); }} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100">
          {groups.map(group => <option key={group.key} value={group.key}>{tr('المجموعة', 'Group')} {group.group_name} · {levelName(group.academic_level, ar)} · {group.academic_year?.code || '—'}</option>)}
        </select>
        <p className="mt-2 text-xs text-slate-500">{selectedGroup?.subgroups.length ?? 0} {tr('مجموعات فرعية', 'subgroups')} · {selectedGroup?.student_count ?? 0} {tr('طلاب', 'students')}</p>
      </section>
      <section aria-label={tr('المجموعات الفرعية', 'Subgroups')} className="space-y-3">
        {selectedGroup?.subgroups.map(subgroup => <SubgroupSection key={subgroup.id} subgroup={subgroup} open={activeSubgroupId === subgroup.id} ar={ar} onToggle={() => setOpenedSubgroupId(activeSubgroupId === subgroup.id ? -1 : subgroup.id)} />)}
      </section>
    </>}
  </div>;
}

function SubgroupSection({ subgroup, open, ar, onToggle }: { subgroup: ReviewSubgroup; open: boolean; ar: boolean; onToggle: () => void }) {
  const tr = (arabic: string, english: string) => ar ? arabic : english;
  const detailQuery = useQuery({
    queryKey: ['clinical-assessment-review-subgroup', subgroup.id],
    queryFn: () => apiFetch<ReviewDetail>(`/clinical-assessments/review-subgroup?subgroup_id=${subgroup.id}`),
    enabled: open,
  });
  const detail = detailQuery.data;
  const weeks = detail?.rotations.flatMap(rotation => rotation.weeks) ?? [];
  const totalReady = weeks.reduce((total, week) => total + week.ready_count, 0);
  const totalExpected = weeks.reduce((total, week) => total + week.student_count, 0);

  return <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
      <div className="min-w-0"><h2 className="text-base font-black text-slate-900">{tr('المجموعة الفرعية', 'Subgroup')} <b dir="ltr" className="inline-block text-teal-800">{subgroup.name}</b></h2><p className="mt-0.5 text-xs text-slate-500">{subgroup.student_count} {tr('طلاب', 'students')} · {subgroup.week_count} {tr('أسابيع تقييم', 'assessment weeks')}</p></div>
      <button type="button" aria-expanded={open} onClick={onToggle} className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-xl border border-teal-200 bg-teal-50 px-3 text-xs font-black text-teal-800"><span>{open ? tr('إخفاء', 'Hide') : tr('الأسابيع', 'Weeks')}</span><ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} /></button>
    </div>
    {!open && <AssessmentWeekTable students={subgroup.students} weeks={[]} ar={ar} label={subgroup.name} />}
    {open && <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-4 sm:px-5">
      {detailQuery.isLoading ? <LoadingState /> : detailQuery.isError ? <ErrorState onRetry={() => detailQuery.refetch()} /> : !detail?.rotations.length ? <><p className="mb-3 text-xs text-slate-500">{tr('لا توجد أسابيع تكليف منشورة لهذه المجموعة بعد.', 'No published assignment weeks for this subgroup yet.')}</p><AssessmentWeekTable students={subgroup.students} weeks={[]} ar={ar} label={subgroup.name} /></> : <>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-black text-slate-900">{tr('التقييمات الأسبوعية', 'Weekly assessments')}</h3><span className="text-xs font-bold text-teal-800">{totalReady}/{totalExpected} {tr('تقييمات مرسلة', 'submitted assessments')}</span></div>
        <div className="space-y-3">{detail.rotations.map(rotation => <section key={rotation.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <header className="border-b border-slate-100 px-3 py-3"><h4 className="text-xs font-black text-slate-900">{courseName(rotation.course, ar)}</h4>{rotation.clinical_period && <p className="mt-0.5 text-[11px] text-slate-500">{courseName(rotation.clinical_period, ar)}</p>}</header>
          <AssessmentWeekTable students={subgroup.students} weeks={rotation.weeks} ar={ar} label={`${subgroup.name} · ${courseName(rotation.course, ar)}`} />
        </section>)}</div>
      </>}
    </div>}
  </article>;
}

function AssessmentWeekTable({ students, weeks, ar, label }: { students: Student[]; weeks: ReviewWeek[]; ar: boolean; label: string }) {
  const { t } = useI18n();
  const [selection, setSelection] = useState<{ row: ReviewStudent; week: ReviewWeek } | null>(null);
  const orderedWeeks = [...weeks].sort((a, b) => a.number - b.number);
  const roster = [...new Map([...students, ...orderedWeeks.flatMap(week => week.students.map(row => row.student))].map(student => [student.id, student])).values()];
  const studentColumn = 'sticky start-0 z-10 w-[180px] min-w-[180px] max-w-[180px] border-e border-slate-200 bg-white px-3 py-3 text-start sm:w-[240px] sm:min-w-[240px] sm:max-w-[240px]';

  return <>
    {orderedWeeks.length > 0 && <p className="border-b border-slate-100 px-3 py-2 text-[11px] text-slate-500">{t('assessments.matrix.hint')}</p>}
    <div role="region" aria-label={label} tabIndex={0} className="overflow-x-auto overscroll-x-contain focus-visible:outline-2 focus-visible:outline-teal-500">
      <table aria-label={label} dir={ar ? 'rtl' : 'ltr'} className="w-full border-separate border-spacing-0 text-xs">
        <thead><tr>
          <th scope="col" className={`${studentColumn} !bg-slate-50 text-slate-700`}>{t('assessments.matrix.student')}</th>
          {orderedWeeks.map(week => <th key={week.number} scope="col" className="min-w-[76px] border-e border-slate-200 bg-teal-50 px-2 py-3 text-center last:border-e-0">
            <span dir="ltr" className="mb-1 block text-[10px] font-medium text-slate-500" title={`${dateLabel(week.start_date, ar)} — ${dateLabel(week.end_date, ar)}`}>{dateLabel(week.start_date, ar)}</span>
            <span className="block font-black text-slate-800">{t('assessments.matrix.week')} {week.number}</span>
          </th>)}
        </tr></thead>
        <tbody>{roster.map(student => <tr key={student.id}>
          <th scope="row" className={`${studentColumn} border-t border-slate-200 font-normal`}>
            <div className="flex items-center gap-2"><ProfilePhotoLightbox photoUrl={student.photo_url} name={studentName(student, ar)} subtitle={student.university_number} enlargeLabel={t('assessments.matrix.enlargePhoto')} shape="circle" />
              <div className="min-w-0"><span className="block break-words text-xs font-bold leading-5 text-slate-900">{studentName(student, ar)}</span><span dir="ltr" className="mt-0.5 block text-start font-mono text-[10px] text-slate-500">{student.university_number}</span></div>
            </div>
          </th>
          {orderedWeeks.map(week => {
            const row = week.students.find(item => item.student.id === student.id);
            const official = row?.assessments.filter(assessment => ['submitted', 'approved'].includes(assessment.status)) ?? [];
            return <td key={week.number} className={`border-e border-t border-slate-200 p-0 text-center last:border-e-0 ${row ? 'bg-teal-50/40' : 'bg-slate-50'}`}>
              {row ? <button type="button" onClick={() => setSelection({ row, week })} aria-label={`${studentName(student, ar)} · ${t('assessments.matrix.week')} ${week.number} · ${label}`} className="flex min-h-16 w-full flex-col items-center justify-center gap-1 px-2 py-2 hover:bg-teal-100/60 focus-visible:outline-2 focus-visible:outline-teal-500">
                <span dir="ltr" className="text-sm font-black tabular-nums text-slate-900">{official.length ? official.map(assessment => assessment.score === null ? '—' : Number(assessment.score).toString()).join(' · ') : '—'}</span>
                {!official.length && <span className="text-[9px] text-slate-500">{row.assessments.length ? t('assessments.matrix.notSubmitted') : t('assessments.matrix.pending')}</span>}
              </button> : <span className="block px-2 py-4 text-slate-400" title={t('assessments.matrix.notAssigned')}>—<span className="sr-only">{t('assessments.matrix.notAssigned')}</span></span>}
            </td>;
          })}
        </tr>)}</tbody>
      </table>
      {!roster.length && <p className="p-4 text-xs text-slate-500">{t('assessments.matrix.noStudents')}</p>}
    </div>
    <Modal isOpen={Boolean(selection)} onClose={() => setSelection(null)} title={`${t('assessments.matrix.week')} ${selection?.week.number ?? ''} · ${label}`} backdropTone="light">
      {selection && <StudentAssessmentRow row={selection.row} ar={ar} />}
    </Modal>
  </>;
}

function StudentAssessmentRow({ row, ar }: { row: ReviewStudent; ar: boolean }) {
  const tr = (arabic: string, english: string) => ar ? arabic : english;
  return <article className="px-3 py-3">
    <div className="flex min-w-0 items-start justify-between gap-2"><div className="min-w-0"><h5 className="break-words text-xs font-black text-slate-900">{studentName(row.student, ar)}</h5><p dir="ltr" className="mt-0.5 text-start font-mono text-[10px] text-slate-500">{row.student.university_number}</p></div><span className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold ${row.ready ? 'bg-teal-50 text-teal-800' : 'bg-slate-100 text-slate-600'}`}>{row.ready ? tr('مرسل', 'Submitted') : row.assessments.length ? tr('غير مرسل', 'Not submitted') : tr('بانتظار التقييم', 'Awaiting assessment')}</span></div>
    {!row.assessments.length ? <p className="mt-2 text-[11px] leading-5 text-slate-500">{tr('لم يصل تقييم بعد', 'No assessment received yet')}{row.supervisors.length ? ` · ${row.supervisors.map(person => personName(person, ar)).join('، ')}` : ''}</p> : <div className="mt-2 space-y-1.5">{row.assessments.map(assessment => <div key={assessment.id} className="rounded-lg bg-slate-50 px-3 py-2 text-[11px]"><div className="flex flex-wrap items-center justify-between gap-1"><span className="min-w-0 break-words text-slate-600">{personName(assessment.evaluator, ar)}</span><span className="flex shrink-0 items-center gap-2"><b dir="ltr" className="text-xs text-slate-900">{assessment.score === null ? '—' : Number(assessment.score).toFixed(1)} / {Number(assessment.max_score).toFixed(0)}</b><span className={assessment.status === 'returned' ? 'font-bold text-amber-700' : assessment.status === 'draft' ? 'font-bold text-slate-500' : 'font-bold text-teal-800'}>{statusLabel(assessment.status, ar)}</span></span></div>{assessment.notes && <details className="mt-1 text-slate-600"><summary className="cursor-pointer font-bold text-teal-800">{tr('ملاحظة المشرف', 'Supervisor note')}</summary><p className="mt-1 whitespace-pre-wrap leading-5">{assessment.notes}</p></details>}</div>)}</div>}
  </article>;
}

function statusLabel(status: string, ar: boolean): string {
  const labels: Record<string, [string, string]> = { submitted: ['مرسل', 'Submitted'], approved: ['معتمد', 'Approved'], returned: ['معاد', 'Returned'], draft: ['مسودة', 'Draft'] };
  const value = labels[status] ?? labels.draft;
  return ar ? value[0] : value[1];
}
