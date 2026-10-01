import { useState } from 'react';
import { X } from 'lucide-react';
import { basicLocale, basicText as bt } from '@/i18n/basicAttendance';

export function BasicArchiveDialog({ label, confirmation, busy, error, onClose, onConfirm }: {
  label: string; confirmation: string; busy: boolean; error: string;
  onClose: () => void; onConfirm: (reason: string) => void;
}) {
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/25 p-4" dir={basicLocale() === 'ar' ? 'rtl' : 'ltr'}>
    <section role="dialog" aria-modal="true" aria-label={bt('archiveTitle')} className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-xl">
      <header className="flex items-center justify-between gap-3"><h2 className="text-lg font-extrabold text-slate-900">{bt('archiveTitle')}</h2><button type="button" aria-label={bt('workClose')} disabled={busy} onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button></header>
      <p className="mt-4 text-sm leading-7 text-slate-600">{bt('archiveExplanation', { label })}</p>
      <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-900">{bt('archiveSafety')}</p>
      <label className="mt-5 block text-xs font-bold text-slate-700">{bt('archiveType', { confirmation })}<input autoFocus className="input mt-2 w-full" dir="auto" value={typed} onChange={event => setTyped(event.target.value)} /></label>
      <label className="mt-4 block text-xs font-bold text-slate-700">{bt('archiveReason')}<textarea required minLength={5} maxLength={500} rows={3} className="input mt-2 w-full" value={reason} onChange={event => setReason(event.target.value)} /></label>
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="mt-6 flex justify-end gap-2"><button type="button" disabled={busy} onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700">{bt('workCancel')}</button><button type="button" disabled={busy || typed !== confirmation || reason.trim().length < 5} onClick={() => onConfirm(reason.trim())} className="rounded-xl bg-red-700 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{bt('archiveConfirm')}</button></div>
    </section>
  </div>;
}
