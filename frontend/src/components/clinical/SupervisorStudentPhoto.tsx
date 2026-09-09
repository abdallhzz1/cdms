import { useState } from 'react';
import { ZoomIn } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { studentName, type Student } from '@/pages/clinical/supervisorWorkspace';

export function SupervisorStudentPhoto({ student, ar }: { student: Student; ar: boolean }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const name = studentName(student, ar);
  const photo = student.photo_url && !failed ? student.photo_url : null;

  return <>
    {photo ? <button type="button" onClick={() => setOpen(true)} className="group relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50" title={ar ? 'تكبير صورة الطالب' : 'Enlarge student photo'}>
      <img src={photo} alt={name} onError={() => setFailed(true)} className="h-full w-full object-cover" />
      <span className="absolute inset-0 hidden place-items-center bg-slate-900/45 text-white group-hover:grid"><ZoomIn className="h-4 w-4" /></span>
    </button> : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-teal-100 bg-teal-50 text-xs font-black text-teal-700">{name.trim().charAt(0) || 'ط'}</span>}
    {photo && <Modal isOpen={open} onClose={() => setOpen(false)} title={name} maxWidth="lg"><div className="flex min-h-64 items-center justify-center rounded-2xl bg-slate-100 p-3"><img src={photo} alt={name} className="max-h-[65vh] max-w-full rounded-xl object-contain" /></div></Modal>}
  </>;
}
