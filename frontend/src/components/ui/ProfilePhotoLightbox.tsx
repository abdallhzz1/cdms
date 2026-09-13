import { useEffect, useState } from 'react';
import { ZoomIn } from 'lucide-react';
import { Modal } from './Modal';

type Props = {
  photoUrl?: string | null;
  name: string;
  subtitle?: string | null;
  enlargeLabel: string;
  size?: 'sm' | 'md';
};

export function ProfilePhotoLightbox({ photoUrl, name, subtitle, enlargeLabel, size = 'md' }: Props) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photoUrl]);
  const photo = photoUrl && !failed ? photoUrl : null;
  const sizeClass = size === 'sm' ? 'h-9 w-9 rounded-xl' : 'h-10 w-10 rounded-xl';

  if (!photo) return <span className={`grid shrink-0 place-items-center border border-teal-100 bg-teal-50 text-xs font-black text-teal-700 ${sizeClass}`}>{name.trim().charAt(0) || '—'}</span>;

  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label={enlargeLabel} title={enlargeLabel} className={`group relative shrink-0 overflow-hidden border border-slate-200 bg-white ${sizeClass}`}>
      <img src={photo} alt={name} onError={() => setFailed(true)} className="h-full w-full object-cover" />
      <span className="absolute inset-0 hidden place-items-center bg-white/80 text-teal-700 group-hover:grid"><ZoomIn className="h-4 w-4" /></span>
    </button>
    <Modal isOpen={open} onClose={() => setOpen(false)} title={name} maxWidth="lg" backdropTone="light">
      <div className="space-y-3">
        {subtitle && <p dir="ltr" className="text-center font-mono text-xs font-bold text-slate-500">{subtitle}</p>}
        <div className="flex min-h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><img src={photo} alt={name} className="max-h-[65vh] max-w-full rounded-xl object-contain" /></div>
      </div>
    </Modal>
  </>;
}
