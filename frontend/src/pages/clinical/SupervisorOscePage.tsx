import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Save } from 'lucide-react';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';
import { SupervisorStudentPhoto } from '@/components/clinical/SupervisorStudentPhoto';
import { groupName, groupSupervisorAssignments, studentName, supervisorErrorMessage, type Assignment, type Student } from './supervisorWorkspace';

type OsceRow = { student: Student; osce_score: string | number | null; grade_status: string | null };
type OsceRoster = { course: { id: number; code: string; name_ar: string; name_en?: string | null }; academic_year_id: number; max_score: number; students: OsceRow[] };

export function SupervisorOscePage() {
  const { user, can } = useAuth();
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const tr = (arabic: string, english: string) => ar ? arabic : english;
  const queryClient = useQueryClient();
  const allowed = (user?.roles ?? []).includes('CLINICAL_SUPERVISOR') && can('supervisor.workspace.view') && can('assessment.create');
  const assignments = useQuery({ queryKey: ['supervisor-osce-groups'], queryFn: () => apiFetch<{ assignments: Assignment[] }>('/operational/my-supervisor-osce/groups'), enabled: allowed });
  const groups = useMemo(() => groupSupervisorAssignments(assignments.data?.assignments ?? []), [assignments.data?.assignments]);
  const [groupKey, setGroupKey] = useState('');
  const group = groups.find(item => item.key === groupKey) ?? groups[0];
  const roster = useQuery({ queryKey: ['supervisor-osce', group?.assignmentId], queryFn: () => apiFetch<OsceRoster>(`/operational/my-supervisor-osce?assignment_id=${group!.assignmentId}`), enabled: allowed && Boolean(group) });
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [notice, setNotice] = useState('');
  useEffect(() => { if (!roster.data) return; setDrafts(Object.fromEntries(roster.data.students.map(row => [row.student.id, row.osce_score == null ? '' : String(row.osce_score)]))); }, [roster.data]);
  const save = useMutation({
    mutationFn: ({ studentId, score }: { studentId: number; score: number }) => apiFetch('/operational/my-supervisor-osce', { method: 'POST', body: { assignment_id: group!.assignmentId, student_id: studentId, osce_score: score } }),
    onSuccess: async () => { setNotice(tr('تم حفظ علامة OSCE النهائية.', 'Final OSCE score saved.')); await queryClient.invalidateQueries({ queryKey: ['supervisor-osce', group?.assignmentId] }); },
  });

  if (!allowed) return <ErrorState title={tr('صلاحية OSCE غير متاحة', 'OSCE access unavailable')} />;
  if (assignments.isLoading) return <LoadingState />;
  if (assignments.isError) return <ErrorState onRetry={() => assignments.refetch()} />;

  return <div className="mx-auto w-full max-w-5xl space-y-4 pb-16">
    <Link to="/supervisor/assessments" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold"><ArrowRight className="h-4 w-4" />{tr('التقييمات الأسبوعية', 'Weekly assessments')}</Link>
    <PageHeader title={tr('OSCE النهائي', 'Final OSCE')} description={tr('علامة واحدة لكل طالب في المساق والعام الأكاديمي؛ لا تتكرر بتكرار الأسابيع. سقف العلامة يأتي من خطة المساق.', 'One mark per student, course and academic year. The maximum comes from the course plan.')} />
    {!groups.length ? <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">{tr('لا توجد مجموعات مكلف بها.', 'No assigned groups.')}</p> : <>
      <label className="block rounded-2xl border border-slate-200 bg-white p-4 text-xs font-bold text-slate-600">{tr('المجموعة والمساق', 'Group and course')}
        <select value={group?.key ?? ''} onChange={event => { setGroupKey(event.target.value); setNotice(''); save.reset(); }} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900">{groups.map(item => <option key={item.key} value={item.key}>{groupName(item, ar)} · {ar ? item.siteAr : item.siteEn} · {item.academicYear}</option>)}</select>
      </label>
      {roster.isLoading ? <LoadingState /> : roster.isError || !roster.data ? <ErrorState onRetry={() => roster.refetch()} /> : <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <header className="border-b border-slate-200 bg-teal-50/60 px-4 py-4"><h2 className="font-black text-slate-900">{ar ? roster.data.course.name_ar : roster.data.course.name_en || roster.data.course.name_ar}</h2><p className="mt-1 text-xs text-teal-800">{tr('علامة OSCE النهائية من', 'Final OSCE score out of')} <b>{Number(roster.data.max_score)}</b> · {tr('التقييم الأسبوعي من 10 يُحسب بشكل منفصل', 'Weekly assessments out of 10 are calculated separately')}</p></header>
        {notice && <p role="status" className="mx-4 mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">{notice}</p>}
        {save.isError && <p role="alert" className="mx-4 mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{supervisorErrorMessage(save.error, ar, tr('تعذر حفظ العلامة.', 'Could not save the mark.'))}</p>}
        {!roster.data.students.length ? <p className="p-5 text-sm text-slate-500">{tr('لا يوجد طلاب في هذه المجموعة.', 'No students in this group.')}</p> : <div className="divide-y divide-slate-100">{roster.data.students.map(row => {
          const value = drafts[row.student.id] ?? '';
          const locked = ['submitted', 'approved', 'published', 'locked'].includes(row.grade_status ?? '');
          const invalid = value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > Number(roster.data!.max_score));
          return <div key={row.student.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
            <div className="flex min-w-0 flex-1 items-center gap-2"><SupervisorStudentPhoto student={row.student} ar={ar}/><div className="min-w-0"><p className="truncate text-xs font-black text-slate-900">{studentName(row.student, ar)}</p><p dir="ltr" className="text-[10px] text-slate-500">{row.student.university_number}</p></div></div>
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700">{tr('العلامة', 'Score')}<input type="number" aria-label={`${tr('OSCE', 'OSCE')} ${studentName(row.student, ar)}`} min="0" max={roster.data!.max_score} step="0.25" disabled={locked} value={value} onChange={event => setDrafts(current => ({ ...current, [row.student.id]: event.target.value }))} className={`h-10 w-20 rounded-lg border px-2 text-center font-black disabled:bg-slate-100 ${invalid ? 'border-red-400' : 'border-slate-200'}`}/><span dir="ltr">/ {Number(roster.data!.max_score)}</span></label>
            <button type="button" disabled={locked || value === '' || invalid || save.isPending || (row.osce_score !== null && Number(value) === Number(row.osce_score))} onClick={() => save.mutate({ studentId: row.student.id, score: Number(value) })} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-teal-700 px-3 text-xs font-bold text-white disabled:opacity-40"><Save className="h-3.5 w-3.5"/>{locked ? tr('الكشف مُرسل', 'Sheet submitted') : tr('حفظ', 'Save')}</button>
          </div>;
        })}</div>}
      </section>}
    </>}
  </div>;
}
