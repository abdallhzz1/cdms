import { useState } from 'react';
import { ZoomIn } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { studentName, type Student } from '@/pages/clinical/supervisorWorkspace';

export function SupervisorStudentPhoto({ student, ar, lightbox = false }: { student: Student; ar: boolean; lightbox?: boolean }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const name = studentName(student, ar);
  const photo = student.photo_url && !failed ? student.photo_url : null;

  return <>
    {photo ? <button type="button" onClick={() => setOpen(true)} className="group relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50" aria-label={ar ? 'تكبير صورة الطالب' : 'Enlarge student photo'} title={ar ? 'تكبير صورة الطالب' : 'Enlarge student photo'}>
      <img src={photo} alt={name} onError={() => setFailed(true)} className="h-full w-full object-cover" />
      <span className={`absolute inset-0 hidden place-items-center group-hover:grid ${lightbox ? 'bg-white/80 text-teal-700' : 'bg-slate-900/45 text-white'}`}><ZoomIn className="h-4 w-4" /></span>
    </button> : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-teal-100 bg-teal-50 text-xs font-black text-teal-700">{name.trim().charAt(0) || 'ط'}</span>}
    {photo && <Modal isOpen={open} onClose={() => setOpen(false)} title={name} maxWidth="lg" backdropTone={lightbox ? 'light' : 'dark'}><div className="space-y-3"><p dir="ltr" className="text-center font-mono text-xs font-bold text-slate-500">{student.university_number}</p><div className="flex min-h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><img src={photo} alt={name} className="max-h-[65vh] max-w-full rounded-xl object-contain" /></div></div></Modal>}
  </>;
}
