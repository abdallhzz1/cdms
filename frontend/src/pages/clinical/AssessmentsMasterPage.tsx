import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Settings2 } from 'lucide-react';
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
type ReviewStudent = { student: Student; supervisors: Person[]; assessments: ReviewAssessment[]; mini_osce?:{score:number|string;max_score:number|string}|null; ready: boolean };
type ReviewWeek = { number: number; block_code?: string | null; start_date: string | null; end_date: string | null; student_count: number; ready_count: number; students: ReviewStudent[] };
type ReviewRotation = { id: number; course: Named | null; clinical_period: Named | null; weeks: ReviewWeek[] };
type ReviewDetail = { subgroup_id: number; rotations: ReviewRotation[] };

const dateLabel = (value: string | null, ar: boolean) => value
  ? new Intl.DateTimeFormat(ar ? 'ar-PS' : 'en-GB', { day: '2-digit', month: '2-digit' }).format(new Date(`${value.slice(0, 10)}T12:00:00`))
  : '—';
const personName = (person: Person | null, ar: boolean) => person ? (ar ? person.full_name_ar : person.full_name_en || person.full_name_ar) : '—';
const courseName = (course: Named | null, ar: boolean) => course ? (ar ? course.name_ar : course.name_en || course.name_ar) || course.code || '—' : '—';
const studentName = (student: Student, ar: boolean) => ar ? student.full_name_ar : student.full_name_en || student.full_name_ar;
const levelName = (level: string | null, ar: boolean) => ({ fourth: ar ? 'السنة الرابعة' : 'Fourth year', fifth: ar ? 'السنة الخامسة' : 'Fifth year', sixth: ar ? 'السنة السادسة' : 'Sixth year' }[level || ''] || level || '');
const slotLabel = (week: ReviewWeek, ar: boolean) => week.number < 0 ? `${ar ? 'فترة' : 'Period'} ${week.block_code || ''}`.trim() : `${ar ? 'الأسبوع' : 'Week'} ${week.number}`;

export function AssessmentsMasterPage() {
  const { can } = useAuth();
  const { locale, t } = useI18n();
  const ar = locale === 'ar';
  const tr = (arabic: string, english: string) => ar ? arabic : english;
  const [groupKey, setGroupKey] = useState('');
  const allowed = can('assessment.review');
  const groupsQuery = useQuery({
    queryKey: ['clinical-assessment-review-groups'],
    queryFn: () => apiFetch<{ groups: ReviewGroup[] }>('/clinical-assessments/review-groups'),
    enabled: allowed,
  });
  const groups = groupsQuery.data?.groups ?? [];
  const selectedGroup = groups.find(group => group.key === groupKey) ?? groups[0] ?? null;

  if (!allowed) return <ErrorState title={tr('لا تملك صلاحية مراجعة التقييمات', 'You do not have permission to review assessments')} />;
  if (groupsQuery.isLoading) return <LoadingState />;
  if (groupsQuery.isError) return <ErrorState onRetry={() => groupsQuery.refetch()} />;

  return <div className="w-full min-w-0 space-y-4 pb-12">
    <PageHeader title={tr('مراجعة التقييمات السريرية', 'Clinical assessment review')}>
      {can('assessment.criteria.manage') && <Link to="/assessments/criteria" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-teal-200 bg-white px-3 text-xs font-bold text-teal-800"><Settings2 className="h-4 w-4" />{tr('نموذج التقييم', 'Assessment template')}</Link>}
    </PageHeader>
    {!groups.length ? <EmptyState message={tr('لا توجد مجموعات في توزيع سريري منشور ضمن السنوات المكلّف بها.', 'No groups exist in a published clinical distribution within your assigned cohorts.')} /> : <>
      <section className="space-y-2 sm:flex sm:items-center sm:gap-4 sm:space-y-0">
        <label htmlFor="assessment-main-group" className="block shrink-0 text-xs font-bold text-slate-600">{tr('المجموعة الرئيسية', 'Main group')}</label>
        <select id="assessment-main-group" value={selectedGroup?.key ?? ''} onChange={event => setGroupKey(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 sm:max-w-md">
          {groups.map(group => <option key={group.key} value={group.key}>{tr('المجموعة', 'Group')} {group.group_name} · {levelName(group.academic_level, ar)} · {group.academic_year?.code || '—'}</option>)}
        </select>
      </section>
      <p className="text-[11px] text-slate-500">{t('assessments.matrix.hint')}</p>
      <section aria-label={tr('المجموعات الفرعية', 'Subgroups')} className="space-y-6">
        {selectedGroup?.subgroups.map(subgroup => <SubgroupSection key={subgroup.id} subgroup={subgroup} ar={ar} />)}
      </section>
    </>}
  </div>;
}

function SubgroupSection({ subgroup, ar }: { subgroup: ReviewSubgroup; ar: boolean }) {
  const tr = (arabic: string, english: string) => ar ? arabic : english;
  const detailQuery = useQuery({
    queryKey: ['clinical-assessment-review-subgroup', subgroup.id],
    queryFn: () => apiFetch<ReviewDetail>(`/clinical-assessments/review-subgroup?subgroup_id=${subgroup.id}`),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const detail = detailQuery.data;
  return <article className="overflow-hidden rounded-xl border border-slate-200 bg-white">
    <header className="border-b border-slate-200 px-4 py-4 sm:px-5">
      <h2 className="flex flex-wrap items-baseline gap-2"><span className="text-xs font-bold text-slate-500">{tr('المجموعة الفرعية', 'Subgroup')}</span><b dir="ltr" className="text-2xl font-black tracking-wide text-teal-800">{subgroup.name}</b></h2>
      <p className="mt-1 text-[11px] text-slate-500">{subgroup.student_count} {tr('طلاب', 'students')} · {subgroup.week_count} {tr('مواعيد تقييم', 'assessment slots')}</p>
    </header>
    <div>
      {detailQuery.isLoading ? <LoadingState /> : detailQuery.isError ? <ErrorState onRetry={() => detailQuery.refetch()} /> : <>
        {!detail?.rotations.length && <p className="px-3 py-3 text-xs text-slate-500">{tr('لا توجد أسابيع تكليف منشورة لهذه المجموعة بعد.', 'No published assignment weeks for this subgroup yet.')}</p>}
        <AssessmentWeekTable students={subgroup.students} rotations={detail?.rotations ?? []} ar={ar} label={subgroup.name} />
      </>}
    </div>
  </article>;
}

function AssessmentWeekTable({ students, rotations, ar, label }: { students: Student[]; rotations: ReviewRotation[]; ar: boolean; label: string }) {
  const { t } = useI18n();
  const matrixRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(() => Math.max(240, window.innerWidth - 24));
  const [startIndex, setStartIndex] = useState(0);
  const [selection, setSelection] = useState<{ row: ReviewStudent; week: ReviewWeek; rotation: ReviewRotation } | null>(null);

  useEffect(() => {
    const container = matrixRef.current;
    if (!container) return;
    const measure = () => {
      const measured = container.getBoundingClientRect().width;
      if (measured > 0) setWidth(measured);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(entries => {
      const measured = entries[0]?.contentRect.width;
      if (measured && measured > 0) setWidth(measured);
    });
    observer?.observe(container);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const assignedRotations = rotations.filter(rotation => rotation.weeks.length > 0);
  const columns = assignedRotations.flatMap(rotation => [...rotation.weeks].sort((a, b) => a.number - b.number).map(week => ({ rotation, week })));
  const roster = [...new Map([...students, ...columns.flatMap(({ week }) => week.students.map(row => row.student))].map(student => [student.id, student])).values()];
  const studentWidth = width < 640 ? Math.min(176, Math.round(width * 0.46)) : 216;
  const capacity = Math.max(1, Math.floor((width - studentWidth) / (width < 640 ? 72 : 62)));
  const maxStart = Math.max(0, (Math.ceil(columns.length / capacity) - 1) * capacity);
  const pageStart = Math.min(Math.floor(startIndex / capacity) * capacity, maxStart);
  const visibleColumns = columns.slice(pageStart, pageStart + capacity);
  const visibleRotations = assignedRotations.map(rotation => ({ rotation, count: visibleColumns.filter(column => column.rotation.id === rotation.id).length })).filter(item => item.count > 0);
  const paged = columns.length > capacity;
  const studentColumn = 'sticky start-0 z-10 border-e border-slate-200 bg-white px-2 py-3 text-start sm:px-3';
  const PreviousIcon = ar ? ChevronRight : ChevronLeft;
  const NextIcon = ar ? ChevronLeft : ChevronRight;

  return <>
    <div ref={matrixRef} className="min-w-0">
      {paged && <div role="group" aria-label={t('assessments.matrix.weekNavigation')} className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-2 py-2 sm:px-3">
        <button type="button" disabled={pageStart === 0} onClick={() => setStartIndex(pageStart - capacity)} aria-label={t('assessments.matrix.previousWeeks')} title={t('assessments.matrix.previousWeeks')} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-200 text-teal-800 hover:bg-teal-50 disabled:cursor-default disabled:opacity-30"><PreviousIcon aria-hidden="true" className="h-4 w-4" /></button>
        <p aria-live="polite" className="min-w-0 text-center text-[11px] font-medium text-slate-600">{t('assessments.matrix.visibleColumns')} <span dir="ltr" className="inline-block font-bold tabular-nums text-slate-800">{pageStart + 1}–{pageStart + visibleColumns.length} / {columns.length}</span></p>
        <button type="button" disabled={pageStart >= maxStart} onClick={() => setStartIndex(pageStart + capacity)} aria-label={t('assessments.matrix.nextWeeks')} title={t('assessments.matrix.nextWeeks')} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-200 text-teal-800 hover:bg-teal-50 disabled:cursor-default disabled:opacity-30"><NextIcon aria-hidden="true" className="h-4 w-4" /></button>
      </div>}
    <div role="region" aria-label={label} tabIndex={0} className="w-full overflow-x-auto overscroll-x-contain focus-visible:outline-2 focus-visible:outline-teal-500">
      <table aria-label={label} dir={ar ? 'rtl' : 'ltr'} className="w-full table-fixed border-separate border-spacing-0 text-xs">
        <colgroup><col style={visibleColumns.length ? { width: studentWidth } : undefined} />{visibleColumns.map(({ rotation, week }) => <col key={`${rotation.id}-${week.number}`} />)}</colgroup>
        <thead><tr>
          <th scope="col" rowSpan={columns.length ? 2 : 1} className={`${studentColumn} !bg-slate-50 text-slate-700`}>{t('assessments.matrix.student')}</th>
          {visibleRotations.map(({ rotation, count }) => <th key={rotation.id} scope="colgroup" colSpan={count} className="break-words border-e border-slate-200 bg-slate-50/60 px-1 py-2 text-center text-[11px] font-medium text-slate-500 last:border-e-0">
            {t('assessments.matrix.course')} {courseName(rotation.course, ar)}{rotation.clinical_period && <span className="hidden sm:inline"> · {courseName(rotation.clinical_period, ar)}</span>}
          </th>)}
        </tr>{columns.length > 0 && <tr>{visibleColumns.map(({ rotation, week }) => <th key={`${rotation.id}-${week.number}`} scope="col" className="border-e border-t border-slate-200 bg-teal-50/50 px-1 py-2.5 text-center last:border-e-0">
            <span dir="ltr" className="mb-1 block text-[10px] font-medium text-slate-500" title={`${dateLabel(week.start_date, ar)} — ${dateLabel(week.end_date, ar)}`}>{dateLabel(week.start_date, ar)}</span>
            <span className="block text-[10px] font-bold text-slate-800 sm:text-[11px]">{slotLabel(week, ar)}</span>
          </th>)}</tr>}</thead>
        <tbody>{roster.map(student => <tr key={student.id}>
          <th scope="row" className={`${studentColumn} border-t border-slate-200 font-normal`}>
            <div className="flex items-center gap-1.5 sm:gap-2"><ProfilePhotoLightbox photoUrl={student.photo_url} name={studentName(student, ar)} subtitle={student.university_number} enlargeLabel={t('assessments.matrix.enlargePhoto')} size="sm" shape="circle" />
              <div className="min-w-0 flex-1"><span className="block break-words text-[11px] font-bold leading-[1.6] text-slate-900 sm:text-xs">{studentName(student, ar)}</span><span dir="ltr" className={`mt-0.5 block break-all font-mono text-[9px] text-slate-500 sm:text-[10px] ${ar ? 'text-right' : 'text-left'}`}>{student.university_number}</span></div>
            </div>
          </th>
          {visibleColumns.map(({ rotation, week }) => {
            const row = week.students.find(item => item.student.id === student.id);
            const official = row?.assessments.filter(assessment => ['submitted', 'approved'].includes(assessment.status)) ?? [];
            return <td key={`${rotation.id}-${week.number}`} className={`border-e border-t border-slate-200 p-0 text-center last:border-e-0 ${row ? 'bg-white' : 'bg-slate-50'}`}>
              {row ? <button type="button" onClick={() => setSelection({ row, week, rotation })} title={!official.length ? (row.assessments.length ? t('assessments.matrix.notSubmitted') : t('assessments.matrix.pending')) : undefined} aria-label={`${studentName(student, ar)} · ${slotLabel(week, ar)} · ${label} · ${courseName(rotation.course, ar)}`} className="flex min-h-16 w-full flex-col items-center justify-center gap-1 px-1 py-2 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-500">
                <span dir="ltr" className={`break-words text-sm font-black tabular-nums ${official.length ? 'text-slate-900' : 'text-slate-400'}`}>{official.length ? official.map(assessment => assessment.score === null ? '—' : Number(assessment.score).toString()).join(' · ') : '—'}</span>
                {!official.length && <span className="sr-only">{row.assessments.length ? t('assessments.matrix.notSubmitted') : t('assessments.matrix.pending')}</span>}
              </button> : <span className="block px-2 py-4 text-slate-400" title={t('assessments.matrix.notAssigned')}>—<span className="sr-only">{t('assessments.matrix.notAssigned')}</span></span>}
            </td>;
          })}
        </tr>)}</tbody>
      </table>
      {!roster.length && <p className="p-4 text-xs text-slate-500">{t('assessments.matrix.noStudents')}</p>}
    </div>
    </div>
    <Modal isOpen={Boolean(selection)} onClose={() => setSelection(null)} title={`${selection ? slotLabel(selection.week, ar) : ''} · ${label}${selection ? ` · ${courseName(selection.rotation.course, ar)}` : ''}`} backdropTone="light">
      {selection && <StudentAssessmentRow row={selection.row} ar={ar} />}
    </Modal>
  </>;
}

function StudentAssessmentRow({ row, ar }: { row: ReviewStudent; ar: boolean }) {
  const tr = (arabic: string, english: string) => ar ? arabic : english;
  return <article className="px-3 py-3">
    <div className="flex min-w-0 items-start justify-between gap-2"><div className="min-w-0"><h5 className="break-words text-xs font-black text-slate-900">{studentName(row.student, ar)}</h5><p dir="ltr" className={`mt-0.5 font-mono text-[10px] text-slate-500 ${ar ? 'text-right' : 'text-left'}`}>{row.student.university_number}</p></div><span className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold ${row.ready ? 'bg-teal-50 text-teal-800' : 'bg-slate-100 text-slate-600'}`}>{row.ready ? tr('مرسل', 'Submitted') : row.assessments.length ? tr('غير مرسل', 'Not submitted') : tr('بانتظار التقييم', 'Awaiting assessment')}</span></div>
    {!row.assessments.length ? <p className="mt-2 text-[11px] leading-5 text-slate-500">{tr('لم يصل تقييم بعد', 'No assessment received yet')}{row.supervisors.length ? ` · ${row.supervisors.map(person => personName(person, ar)).join('، ')}` : ''}</p> : <div className="mt-2 space-y-1.5">{row.assessments.map(assessment => <div key={assessment.id} className="rounded-lg bg-slate-50 px-3 py-2 text-[11px]"><div className="flex flex-wrap items-center justify-between gap-1"><span className="min-w-0 break-words text-slate-600">{personName(assessment.evaluator, ar)}</span><span className="flex shrink-0 items-center gap-2"><b dir="ltr" className="text-xs text-slate-900">{assessment.score === null ? '—' : Number(assessment.score).toFixed(1)} / {Number(assessment.max_score).toFixed(0)}</b><span className={assessment.status === 'returned' ? 'font-bold text-amber-700' : assessment.status === 'draft' ? 'font-bold text-slate-500' : 'font-bold text-teal-800'}>{statusLabel(assessment.status, ar)}</span></span></div>{assessment.notes && <details className="mt-1 text-slate-600"><summary className="cursor-pointer font-bold text-teal-800">{tr('ملاحظة المشرف', 'Supervisor note')}</summary><p className="mt-1 whitespace-pre-wrap leading-5">{assessment.notes}</p></details>}</div>)}</div>}
    {row.mini_osce && <p className="mt-2 rounded-lg bg-teal-50 px-3 py-2 text-xs font-bold text-teal-900">{tr('ميني أوسكي لهذه الفترة', 'Mini OSCE for this period')}: {Number(row.mini_osce.score)} / {Number(row.mini_osce.max_score)}</p>}
  </article>;
}

function statusLabel(status: string, ar: boolean): string {
  const labels: Record<string, [string, string]> = { submitted: ['مرسل', 'Submitted'], approved: ['معتمد', 'Approved'], returned: ['معاد', 'Returned'], draft: ['مسودة', 'Draft'] };
  const value = labels[status] ?? labels.draft;
  return ar ? value[0] : value[1];
}
