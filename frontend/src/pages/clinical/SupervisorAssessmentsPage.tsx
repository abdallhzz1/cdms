import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CircleAlert, ChevronLeft, ChevronRight, Save } from 'lucide-react';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { SupervisorStudentNotesButton } from '@/components/clinical/SupervisorStudentNotesButton';
import { SupervisorStudentPhoto } from '@/components/clinical/SupervisorStudentPhoto';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { formatDate, groupName, groupSupervisorAssignments, studentName, supervisorErrorMessage, templateForGroup, today, workspaceQueryKey, type Assessment, type AssessmentTemplate, type Student, type SupervisorGroup, type SupervisorStudentNote, type Workspace } from './supervisorWorkspace';

const labels: Record<string, { ar: string; en: string }> = {
  draft: { ar: 'غير مرسل', en: 'Not submitted' }, submitted: { ar: 'مرسل لمساعد البحث والتدريس', en: 'Sent to the research and teaching assistant' },
  approved: { ar: 'معتمد', en: 'Approved' }, returned: { ar: 'معاد للتعديل', en: 'Returned' },
};

function CriteriaGuideButton({ template, ar }: { template: AssessmentTemplate; ar: boolean }) {
  const [open, setOpen] = useState(false); const tr = (a: string, e: string) => ar ? a : e;
  return <><button type="button" onClick={() => setOpen(true)} className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-full border border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100" aria-label={tr('عرض تقسيمة العلامة', 'View score breakdown')} title={tr('عرض تقسيمة العلامة', 'View score breakdown')}><CircleAlert className="h-4 w-4" /></button>
    <Modal isOpen={open} onClose={() => setOpen(false)} title={tr('تقسيمة علامة التقييم', 'Assessment score breakdown')} maxWidth="md">
      <p className="mb-3 text-xs leading-5 text-slate-500">{tr('استخدم هذه التقسيمة كدليل عند وضع العلامة النهائية من 10. لا تُدخل درجة كل بند بشكل منفصل.', 'Use this breakdown as guidance when entering the final score out of 10. Criteria are not scored separately.')}</p>
      <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200">{template.criteria.map((criterion, index) => <div key={criterion.id} className="flex items-center justify-between gap-3 px-4 py-3 text-xs"><span className="font-bold text-slate-700">{index + 1}. {ar ? criterion.name_ar : criterion.name_en || criterion.name_ar}</span><span className="shrink-0 rounded-lg bg-teal-50 px-2 py-1 font-black text-teal-800">{Number(criterion.max_score)} / 10</span></div>)}</div>
      <p className="mt-3 text-[11px] font-bold text-slate-500">{tr(`النطاق: ${template.course_id ? 'المساق المحدد' : 'كل المساقات'} · ${template.batch_year ? `دفعة ${template.batch_year}` : 'كل الدفعات'}`, `Scope: ${template.course_id ? 'selected course' : 'all courses'} · ${template.batch_year ? `cohort ${template.batch_year}` : 'all cohorts'}`)}</p>
    </Modal></>;
}

function AssessmentStudentRow({ student, group, template, existing, privateNotes, score, note, disabled, ar, onScoreChange, onNoteChange }: {
  student: Student; group: SupervisorGroup; template: AssessmentTemplate; existing?: Assessment; privateNotes: SupervisorStudentNote[];
  score: string; note: string; disabled: boolean; ar: boolean; onScoreChange: (value: string) => void; onNoteChange: (value: string) => void;
}) {
  const tr = (a: string, e: string) => ar ? a : e;
  const [noteOpen, setNoteOpen] = useState(Boolean(note));
  useEffect(() => { if (note.trim()) setNoteOpen(true); }, [note]);
  const locked = ['submitted', 'approved'].includes(existing?.status ?? '');
  const status = labels[existing?.status ?? 'draft'] ?? labels.draft;
  const latestPrivateNote = privateNotes.filter(item => item.student_id === student.id && (!item.student_clinical_assignment_id || item.student_clinical_assignment_id === group.studentAssignmentIds[student.id]))
    .sort((a, b) => `${b.note_date}-${b.id}`.localeCompare(`${a.note_date}-${a.id}`))[0];
  const invalidScore = score !== '' && (!Number.isFinite(Number(score)) || Number(score) < 0 || Number(score) > Number(template.total_score));

  return <div className="grid min-w-0 gap-3 px-3.5 py-4 lg:grid-cols-[minmax(0,1.5fr)_150px_minmax(0,1.2fr)_120px] lg:items-center lg:px-4">
    <div className="flex min-w-0 items-center justify-between gap-2 lg:justify-start"><div className="flex min-w-0 items-center gap-2.5"><SupervisorStudentPhoto student={student} ar={ar}/><div className="min-w-0"><p className="truncate text-xs font-black text-slate-900">{studentName(student, ar)}</p><p dir="ltr" className="mt-0.5 text-[10px] text-slate-500">{student.university_number}</p>{existing?.return_reason && <p className="mt-1 text-[10px] font-bold text-amber-700">{tr('سبب الإعادة:', 'Return reason:')} {existing.return_reason}</p>}</div></div><span className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold lg:mr-auto ${existing?.status === 'returned' ? 'bg-amber-50 text-amber-700' : locked ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{ar ? status.ar : status.en}</span></div>
    <div className="flex items-center justify-between gap-2 lg:justify-center"><span className="text-[11px] font-black text-slate-600 lg:sr-only">{tr('العلامة', 'Score')}</span><div className="flex items-center gap-2"><CriteriaGuideButton template={template} ar={ar}/><div dir="ltr" className="inline-flex items-center gap-1.5"><input aria-label={tr('العلامة من 10', 'Score out of 10')} disabled={disabled} type="number" min="0" max="10" step="0.25" value={score} onChange={event => onScoreChange(event.target.value)} className={`h-11 w-24 rounded-xl border bg-white px-2 text-center text-base font-black outline-none focus:border-teal-400 disabled:bg-slate-100 lg:h-10 lg:w-20 lg:text-sm ${invalidScore ? 'border-rose-400' : 'border-slate-200'}`}/><span className="text-xs font-black text-slate-500">/ 10</span></div></div></div>
    <div className="min-w-0"><button type="button" onClick={() => setNoteOpen(value => !value)} aria-expanded={noteOpen} className="text-[11px] font-bold text-teal-800 lg:hidden">{noteOpen ? tr('إخفاء ملاحظة التقييم', 'Hide assessment note') : tr('إضافة ملاحظة للتقييم (اختياري)', 'Add assessment note (optional)')}</button><div className={`${noteOpen ? 'mt-2 block' : 'hidden'} lg:mt-0 lg:block`}><label className="sr-only" htmlFor={`assessment-note-${group.key}-${student.id}`}>{tr('ملاحظة التقييم', 'Assessment note')}</label><input id={`assessment-note-${group.key}-${student.id}`} disabled={disabled} value={note} onChange={event => onNoteChange(event.target.value)} placeholder={tr('ملاحظة التقييم، اختيارية', 'Assessment note, optional')} className="h-11 w-full min-w-0 rounded-xl border border-slate-200 px-3 text-xs outline-none focus:border-teal-400 disabled:bg-slate-100 lg:h-10"/></div></div>
    <div className="min-w-0"><SupervisorStudentNotesButton student={student} group={group} notes={privateNotes}/>{latestPrivateNote && <p className="mt-1 truncate text-[10px] text-slate-500 lg:hidden">{tr('آخر ملاحظة خاصة:', 'Latest private note:')} {latestPrivateNote.note}</p>}</div>
  </div>;
}

export function SupervisorAssessmentsPage() {
  const { user, can } = useAuth(); const { locale } = useI18n(); const ar = locale === 'ar'; const tr = (a: string, e: string) => ar ? a : e; const queryClient = useQueryClient(); const [params] = useSearchParams();
  const isSupervisor = (user?.roles ?? []).some(role => String(role).toUpperCase() === 'CLINICAL_SUPERVISOR');
  const workspace = useQuery({ queryKey: workspaceQueryKey, queryFn: () => apiFetch<Workspace>('/operational/my-supervisor-workspace'), enabled: isSupervisor && can('supervisor.workspace.view') && can('assessment.create') });
  const groups = useMemo(() => groupSupervisorAssignments(workspace.data?.assignments ?? []), [workspace.data?.assignments]);
  const weeks = useMemo(() => { const map = new Map<number, { number: number; start_date: string; end_date: string }>(); groups.flatMap(group => group.evaluationWeeks).forEach(item => map.set(item.number, item)); return [...map.values()].sort((a, b) => a.number - b.number); }, [groups]);
  const [week, setWeek] = useState(0); const [selectedGroup, setSelectedGroup] = useState(params.get('group') ?? ''); const [scores, setScores] = useState<Record<string, string>>({}); const [notes, setNotes] = useState<Record<string, string>>({}); const [notice, setNotice] = useState('');

  useEffect(() => { if (!weeks.length) return; const requested = Number(params.get('week')); const current = weeks.find(item => today() >= item.start_date && today() <= item.end_date) ?? weeks.find(item => item.start_date > today()) ?? weeks.at(-1)!; setWeek(value => weeks.some(item => item.number === requested) ? requested : weeks.some(item => item.number === value) ? value : current.number); const requestedGroup = params.get('group'); if (requestedGroup) setSelectedGroup(requestedGroup); }, [weeks, params]);
  const weeklyGroups = useMemo(() => groups.filter(group => group.evaluationWeeks.some(item => item.number === week)), [groups, week]);
  useEffect(() => { if (weeklyGroups.length && !weeklyGroups.some(group => group.key === selectedGroup)) setSelectedGroup(weeklyGroups[0].key); }, [weeklyGroups, selectedGroup]);
  const visibleGroups = useMemo(() => weeklyGroups.filter(group => group.key === selectedGroup), [weeklyGroups, selectedGroup]);
  const selectedWeek = weeks.find(item => item.number === week); const selectedWeekIndex = weeks.findIndex(item => item.number === week); const futureWeek = !!selectedWeek && selectedWeek.start_date > today();
  const existingFor = (group: SupervisorGroup, studentId: number): Assessment | undefined => workspace.data?.assessments.find(item => item.student_id === studentId && item.student_clinical_assignment_id === group.studentAssignmentIds[studentId] && item.evaluation_week === week);

  useEffect(() => { if (!workspace.data || !week) return; setScores(current => { const next = { ...current }; visibleGroups.forEach(group => group.students.forEach(student => { const key = `${group.key}:${week}:${student.id}`; if (next[key] === undefined) { const score = existingFor(group, student.id)?.score; next[key] = score === null || score === undefined ? '' : String(score); } })); return next; }); setNotes(current => { const next = { ...current }; visibleGroups.forEach(group => group.students.forEach(student => { const key = `${group.key}:${week}:${student.id}`; if (next[key] === undefined) next[key] = existingFor(group, student.id)?.notes ?? ''; })); return next; }); }, [workspace.data, visibleGroups, week]);
  const pendingStudents = (group: SupervisorGroup) => group.students.filter(student => !['submitted', 'approved'].includes(existingFor(group, student.id)?.status ?? ''));
  const payloadFor = (group: SupervisorGroup) => { const template = templateForGroup(workspace.data?.assessment_templates ?? [], group); if (!template) throw new Error('missing-template'); return { assignment_id: group.assignmentId, evaluation_week: week, template_id: template.id, assessments: pendingStudents(group).map(student => ({ student_id: student.id, score: Number(scores[`${group.key}:${week}:${student.id}`]), notes: notes[`${group.key}:${week}:${student.id}`] || null })) }; };
  const validScoreFor = (group: SupervisorGroup, student: Student, template: AssessmentTemplate) => { const raw = scores[`${group.key}:${week}:${student.id}`]; const value = Number(raw); return raw !== '' && raw !== undefined && Number.isFinite(value) && value >= 0 && value <= Number(template.total_score); };
  const groupComplete = (group: SupervisorGroup) => { if (futureWeek) return false; const template = templateForGroup(workspace.data?.assessment_templates ?? [], group); const pending = pendingStudents(group); return !!template && pending.length > 0 && pending.every(student => validScoreFor(group, student, template)); };
  const save = useMutation({ mutationFn: (group: SupervisorGroup) => apiFetch('/operational/my-supervisor-assessment-batches', { method: 'POST', body: payloadFor(group) }), onSuccess: async (_, group) => { setNotice(tr(`تم إرسال تقييم ${group.group} للأسبوع ${week}.`, `Assessment for ${group.group}, week ${week}, was submitted.`)); await queryClient.invalidateQueries({ queryKey: workspaceQueryKey }); } });
  const moveWeek = (step: number) => { const next = weeks[selectedWeekIndex + step]; if (next) { setWeek(next.number); setNotice(''); } };

  if (!isSupervisor) return <ErrorState title={tr('تقييمات المشرف', 'Supervisor assessments')} message={tr('هذه الشاشة مخصصة للمشرف السريري.', 'This page is for clinical supervisors.')} />;
  if (!can('supervisor.workspace.view') || !can('assessment.create')) return <ErrorState title={tr('صلاحية التقييم غير مفعلة', 'Assessment permission is disabled')} />;
  if (workspace.isLoading) return <LoadingState />; if (workspace.isError || !workspace.data) return <ErrorState onRetry={() => workspace.refetch()} />;
  return <div className="mx-auto w-full min-w-0 max-w-7xl space-y-4 pb-16 sm:space-y-5">
    <Link to="/supervisor/portal" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold"><ArrowRight className="h-4 w-4" />{tr('الرجوع للوحة المشرف', 'Back to dashboard')}</Link>
    <PageHeader title={tr('التقييم السريري الأسبوعي', 'Weekly clinical assessment')} description={tr('أدخل علامة من 10 لكل طالب، ثم راجع المجموعة قبل الإرسال.', 'Enter a score out of 10 for each student, then review the group before submission.')} />
    {!weeks.length ? <ErrorState title={tr('لا توجد أسابيع تكليف', 'No assignment weeks')} /> : <>
      <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-4"><div className="grid min-w-0 gap-3 lg:grid-cols-2 lg:items-end"><div className="min-w-0"><label className="mb-1.5 block text-[11px] font-black text-slate-500">{tr('أسبوع التقييم', 'Assessment week')}</label><div className="flex min-w-0 gap-2"><button type="button" disabled={selectedWeekIndex <= 0} onClick={() => moveWeek(-1)} className="hidden h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 disabled:opacity-30 sm:grid">{ar ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}</button><select value={week} onChange={event => { setWeek(Number(event.target.value)); setNotice(''); }} className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:border-teal-500 sm:h-10">{weeks.map(item => <option key={item.number} value={item.number}>{`${tr(`الأسبوع ${item.number}`, `Week ${item.number}`)} — \u200E${formatDate(item.start_date, ar)}\u200E`}</option>)}</select><button type="button" disabled={selectedWeekIndex < 0 || selectedWeekIndex >= weeks.length - 1} onClick={() => moveWeek(1)} className="hidden h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 disabled:opacity-30 sm:grid">{ar ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button></div></div><div className="min-w-0"><label className="mb-1.5 block text-[11px] font-black text-slate-500">{tr('المجموعة', 'Group')}</label><select value={selectedGroup} onChange={event => setSelectedGroup(event.target.value)} className="h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:border-teal-500 sm:h-10">{weeklyGroups.length ? weeklyGroups.map(group => <option key={group.key} value={group.key}>{groupName(group, ar)}</option>) : <option value="">{tr('لا توجد مجموعة لهذا الأسبوع', 'No group this week')}</option>}</select></div></div>{selectedWeek && <div className="mt-3 hidden flex-wrap gap-2 border-t border-slate-100 pt-3 text-[11px] sm:flex"><span className="rounded-lg bg-teal-50 px-2.5 py-1.5 font-black text-teal-800">{tr(`الأسبوع ${week}`, `Week ${week}`)}</span><span dir="ltr" className="rounded-lg bg-slate-100 px-2.5 py-1.5 font-bold text-slate-700">{formatDate(selectedWeek.start_date, ar)} — {formatDate(selectedWeek.end_date, ar)}</span></div>}</section>
      {futureWeek && <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">{tr('هذا الأسبوع لم يبدأ بعد. سيُفعّل إدخال العلامات عند بدايته.', 'This week has not started yet. Score entry becomes available when it starts.')}</p>}{notice && <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{notice}</p>}
      <div className="space-y-4">{visibleGroups.map(group => {
        const template = templateForGroup(workspace.data.assessment_templates ?? [], group);
        const pending = pendingStudents(group);
        const pendingCount = pending.length;
        const fullySubmitted = pendingCount === 0;
        const completed = group.students.length - pendingCount + (template ? pending.filter(student => validScoreFor(group, student, template)).length : 0);
        const firstInvalid = template ? pending.find(student => !validScoreFor(group, student, template)) : undefined;
        const rawInvalid = firstInvalid ? scores[`${group.key}:${week}:${firstInvalid.id}`] : undefined;
        const disabledReason = !template ? tr('لا يوجد نموذج تقييم معتمد لهذه المجموعة.', 'No approved assessment template is available for this group.')
          : futureWeek ? tr('لم يبدأ أسبوع التقييم بعد.', 'The assessment week has not started yet.')
          : fullySubmitted ? tr('جميع تقييمات المجموعة مرسلة بالفعل.', 'All assessments in this group have already been submitted.')
          : firstInvalid ? rawInvalid === '' || rawInvalid === undefined
            ? tr(`أدخل علامة ${studentName(firstInvalid, ar)} قبل الإرسال.`, `Enter a score for ${studentName(firstInvalid, ar)} before submitting.`)
            : tr(`علامة ${studentName(firstInvalid, ar)} يجب أن تكون من 0 إلى 10.`, `${studentName(firstInvalid, ar)} needs a score from 0 to 10.`)
          : '';
        return <section key={group.key} className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-200 px-3.5 py-3.5 sm:px-4"><div className="flex min-w-0 items-start justify-between gap-2"><div className="min-w-0"><h2 className="break-words text-sm font-black leading-6 text-slate-900">{groupName(group, ar)}</h2><p className="mt-0.5 text-[10px] text-slate-500">{ar ? group.siteAr : group.siteEn} · {group.batchYear ? tr(`دفعة ${group.batchYear}`, `Cohort ${group.batchYear}`) : tr('كل الدفعات', 'All cohorts')}</p></div><span className="shrink-0 rounded-lg bg-teal-50 px-2 py-1.5 text-[10px] font-black text-teal-800">{completed}/{group.students.length} {tr('جاهز', 'ready')}</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${group.students.length ? Math.round(completed / group.students.length * 100) : 0}%` }}/></div></header>
          {!template ? <p className="p-5 text-sm font-bold text-amber-700">{tr('لا يوجد نموذج تقييم معتمد لهذا المساق والدفعة.', 'No approved assessment template exists for this course and cohort.')}</p> : <>
            <div className="hidden grid-cols-[minmax(0,1.5fr)_150px_minmax(0,1.2fr)_120px] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-[10px] font-black text-slate-500 lg:grid"><span>{tr('الطالب والحالة', 'Student and status')}</span><span className="text-center">{tr('العلامة', 'Score')}</span><span>{tr('ملاحظة التقييم', 'Assessment note')}</span><span>{tr('ملاحظاتي الخاصة', 'Private notes')}</span></div>
            <div className="divide-y divide-slate-100">{group.students.map(student => { const key = `${group.key}:${week}:${student.id}`; const existing = existingFor(group, student.id); return <AssessmentStudentRow key={student.id} student={student} group={group} template={template} existing={existing} privateNotes={workspace.data.student_notes ?? []} score={scores[key] ?? ''} note={notes[key] ?? ''} disabled={futureWeek || ['submitted', 'approved'].includes(existing?.status ?? '')} ar={ar} onScoreChange={value => setScores(current => ({ ...current, [key]: value }))} onNoteChange={value => setNotes(current => ({ ...current, [key]: value }))}/>; })}</div>
          </>}
          <footer className="border-t border-slate-100 bg-slate-50/70 px-3.5 py-3 sm:flex sm:items-center sm:justify-between sm:gap-3 sm:px-4"><p className={`mb-2 text-[11px] font-bold leading-5 sm:mb-0 ${disabledReason ? 'text-slate-600' : 'text-teal-800'}`}>{disabledReason || tr('كل العلامات جاهزة. راجعها ثم أرسل تقييم المجموعة.', 'All scores are ready. Review them before submitting the group.')}</p><Button size="sm" disabled={!template || !groupComplete(group)} isLoading={save.isPending && save.variables?.key === group.key} onClick={() => save.mutate(group)} className="min-h-11 w-full justify-center sm:min-h-0 sm:w-auto"><Save className="h-3.5 w-3.5"/>{fullySubmitted ? tr('تم إرسال تقييم المجموعة', 'Group assessment submitted') : pendingCount < group.students.length ? tr(`إرسال ${pendingCount} تقييم جديد`, `Submit ${pendingCount} new assessment${pendingCount === 1 ? '' : 's'}`) : tr('إرسال تقييم المجموعة', 'Submit group assessment')}</Button></footer>
        </section>;
      })}</div>
    </>}
    {save.isError && <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{supervisorErrorMessage(save.error, ar, tr('تعذر إرسال التقييم. تأكد من إدخال علامة من 10 لكل طالب.', 'Unable to submit. Enter a score out of 10 for every student.'))}</p>}
  </div>;
}
