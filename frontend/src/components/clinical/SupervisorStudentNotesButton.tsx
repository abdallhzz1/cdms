import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { NotebookPen, Pencil, Plus, Trash2 } from 'lucide-react';
import { apiFetch } from '@/api/client';
import { useI18n } from '@/i18n/I18nContext';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { clampDate, formatDate, formatWeekday, today, workspaceQueryKey, type Student, type SupervisorGroup, type SupervisorStudentNote } from '@/pages/clinical/supervisorWorkspace';

type Props = { student: Student; group: SupervisorGroup; notes: SupervisorStudentNote[]; defaultDate?: string };

export function SupervisorStudentNotesButton({ student, group, notes, defaultDate }: Props) {
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const tr = (arabic: string, english: string) => ar ? arabic : english;
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SupervisorStudentNote | null>(null);
  const initialDate = () => clampDate(group, defaultDate || today());
  const [date, setDate] = useState(initialDate);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const assignmentId = group.studentAssignmentIds[student.id];
  const relevantNotes = notes.filter(note => note.student_id === student.id && (!note.student_clinical_assignment_id || note.student_clinical_assignment_id === assignmentId)).sort((a, b) => `${b.note_date}-${b.id}`.localeCompare(`${a.note_date}-${a.id}`));
  const resetForm = () => { setEditing(null); setDate(initialDate()); setText(''); setError(''); };
  const refresh = async () => { await client.invalidateQueries({ queryKey: workspaceQueryKey }); resetForm(); };
  const save = useMutation({
    mutationFn: () => apiFetch(editing ? `/operational/my-supervisor-student-notes/${editing.id}` : '/operational/my-supervisor-student-notes', {
      method: editing ? 'PUT' : 'POST',
      body: editing ? { note_date: date, note: text.trim() } : { assignment_id: group.assignmentId, student_id: student.id, note_date: date, note: text.trim() },
    }),
    onSuccess: refresh,
    onError: (reason: unknown) => setError(reason instanceof Error ? reason.message : tr('تعذر حفظ الملاحظة.', 'Unable to save note.')),
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiFetch(`/operational/my-supervisor-student-notes/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
    onError: (reason: unknown) => setError(reason instanceof Error ? reason.message : tr('تعذر حذف الملاحظة.', 'Unable to delete note.')),
  });

  return <>
    <button type="button" onClick={() => { resetForm(); setOpen(true); }} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-800 transition hover:bg-amber-100" title={tr('مفكرة خاصة لا تظهر للطالب أو لمشرف آخر', 'Private notes hidden from students and other supervisors')}>
      <NotebookPen className="h-3.5 w-3.5" />
      {tr('ملاحظاتي', 'My notes')}
      {relevantNotes.length > 0 && <span className="rounded-full bg-amber-700 px-1.5 py-0.5 text-[9px] text-white">{relevantNotes.length}</span>}
    </button>
    <Modal isOpen={open} onClose={() => setOpen(false)} title={`${tr('ملاحظاتي الخاصة —', 'My private notes —')} ${ar ? student.full_name_ar : student.full_name_en || student.full_name_ar}`} maxWidth="lg">
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold leading-5 text-amber-800">{tr('هذه مفكرة خاصة بك. لا تظهر للطالب ولا للمشرفين الآخرين ولا تدخل في التقييم الرسمي تلقائيًا.', 'This is your private notebook. Students and other supervisors cannot see it, and it is not automatically part of the official assessment.')}</div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="grid gap-3 sm:grid-cols-[10rem_1fr]"><input type="date" min={group.startDate || undefined} max={group.endDate || undefined} value={date} onChange={event => setDate(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:border-teal-400" /><textarea value={text} onChange={event => setText(event.target.value)} rows={3} placeholder={tr('اكتب ملاحظة مختصرة تساعدك عند تقييم الطالب لاحقًا…', 'Write a concise note to help with the student assessment later…')} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs leading-5 outline-none focus:border-teal-400" /></div>
          {error && <p className="mt-2 text-xs font-bold text-red-600">{error}</p>}
          <div className="mt-3 flex justify-end gap-2">{editing && <Button size="sm" variant="outline" onClick={resetForm}>{tr('إلغاء التعديل', 'Cancel edit')}</Button>}<Button size="sm" disabled={!date || text.trim().length < 2} isLoading={save.isPending} onClick={() => save.mutate()}><Plus className="ml-1 h-4 w-4" />{editing ? tr('حفظ التعديل', 'Save changes') : tr('إضافة الملاحظة', 'Add note')}</Button></div>
        </div>
        <div className="space-y-2">
          {!relevantNotes.length ? <p className="py-6 text-center text-xs font-bold text-slate-400">{tr('لا توجد ملاحظات سابقة لهذا الطالب.', 'No previous notes for this student.')}</p> : relevantNotes.map(note => <article key={note.id} className="rounded-2xl border border-slate-200 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><time className="text-[10px] font-bold text-teal-700">{formatWeekday(String(note.note_date).slice(0,10),ar)} · <span dir="ltr" className="inline-block">{formatDate(String(note.note_date).slice(0,10),ar)}</span></time><p className="mt-1 whitespace-pre-wrap text-xs leading-6 text-slate-700">{note.note}</p></div><div className="flex shrink-0 gap-1"><button type="button" onClick={() => { setEditing(note); setDate(String(note.note_date).slice(0, 10)); setText(note.note); setError(''); }} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title={tr('تعديل', 'Edit')}><Pencil className="h-3.5 w-3.5" /></button><button type="button" disabled={remove.isPending} onClick={() => { if (window.confirm(tr('حذف هذه الملاحظة الخاصة؟', 'Delete this private note?'))) remove.mutate(note.id); }} className="rounded-lg p-2 text-red-500 hover:bg-red-50" title={tr('حذف', 'Delete')}><Trash2 className="h-3.5 w-3.5" /></button></div></div></article>)}
        </div>
      </div>
    </Modal>
  </>;
}
