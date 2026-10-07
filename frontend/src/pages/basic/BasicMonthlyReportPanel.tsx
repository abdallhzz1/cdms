import { useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { basicText as bt } from '@/i18n/basicAttendance';

export type WarningThreshold = 2 | 3;
export type MonthlyStudent = {
  id: number; name: string; university_number: string; email: string; photo_url?: string | null;
  sessions: number; present: number; absent: number; excused: number; incomplete: number; late: number;
  total_absent: number; is_enrolled: boolean; notifications: Record<string, string>;
};
export type MonthlySummary = { month: string; finalized_sessions: number; students: MonthlyStudent[] };

const PAGE_SIZE = 12;

export function warningTier(student: MonthlyStudent): WarningThreshold | null {
  if (student.total_absent >= 3) return 3;
  if (student.total_absent === 2) return 2;
  return null;
}

export function eligibleForWarning(student: MonthlyStudent, threshold: WarningThreshold): boolean {
  return student.is_enrolled && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(student.email?.trim() ?? '')
    && warningTier(student) === threshold && !student.notifications?.[String(threshold)];
}

export function BasicMonthlyReportPanel({ summary, busy, canNotify, onWarn, onBulk }: {
  summary: MonthlySummary;
  busy: boolean;
  canNotify: boolean;
  onWarn: (student: MonthlyStudent, threshold: WarningThreshold) => void;
  onBulk: (threshold: WarningThreshold, students: MonthlyStudent[]) => void;
}) {
  const [search, setSearch] = useState('');
  const [pendingOnly, setPendingOnly] = useState(false);
  const [requestedPage, setRequestedPage] = useState(1);
  const pendingTwo = summary.students.filter(student => eligibleForWarning(student, 2));
  const pendingThree = summary.students.filter(student => eligibleForWarning(student, 3));
  const term = search.trim().toLocaleLowerCase();
  const filtered = summary.students.filter(student => {
    const matches = !term || `${student.name} ${student.university_number}`.toLocaleLowerCase().includes(term);
    return matches && (!pendingOnly || (warningTier(student) !== null && student.is_enrolled && !student.notifications?.[String(warningTier(student))]));
  });
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pages);
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const followUp = (student: MonthlyStudent) => {
    const tier = warningTier(student);
    if (!student.is_enrolled) return <span className="text-xs text-slate-500">{bt('workFormerStudent')}</span>;
    if (!tier) return <span className="text-slate-400">—</span>;
    if (student.notifications?.[String(tier)]) return <span className="text-xs font-semibold text-teal-700">{bt('workWarningAlreadySent')}</span>;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(student.email?.trim() ?? '')) return <span className="text-xs font-semibold text-rose-700">{bt('workWarningMissingEmail')}</span>;
    if (!canNotify) return <span className="text-xs text-amber-700">{bt('workWarningPending')}</span>;
    return <button type="button" disabled={busy} onClick={() => onWarn(student, tier)} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50">{bt(tier === 3 ? 'workSendMeetingWarning' : 'workSendFirstWarning')}</button>;
  };

  return <div className="space-y-3">
    {canNotify && (pendingTwo.length > 0 || pendingThree.length > 0) && <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3 sm:p-4">
      <p className="text-sm font-extrabold text-amber-950">{bt('workBulkTitle')}</p>
      <p className="mt-1 text-xs leading-5 text-amber-900">{bt('workBulkScope')}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {pendingTwo.length > 0 && <button type="button" disabled={busy} onClick={() => onBulk(2, pendingTwo)} className="min-h-10 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-950 disabled:opacity-50">{bt('workBulkTwo', { count: pendingTwo.length })}</button>}
        {pendingThree.length > 0 && <button type="button" disabled={busy} onClick={() => onBulk(3, pendingThree)} className="min-h-10 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-800 disabled:opacity-50">{bt('workBulkThree', { count: pendingThree.length })}</button>}
      </div>
    </div>}

    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <label className="relative block min-w-0 flex-1"><Search size={16} className="pointer-events-none absolute inset-y-0 start-3 my-auto text-slate-400" aria-hidden="true" /><input type="search" value={search} onChange={event => { setSearch(event.target.value); setRequestedPage(1); }} aria-label={bt('workMonthlySearch')} placeholder={bt('workMonthlySearch')} className="input w-full ps-10" /></label>
      <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700"><input type="checkbox" checked={pendingOnly} onChange={event => { setPendingOnly(event.target.checked); setRequestedPage(1); }} className="accent-teal-700" />{bt('workPendingOnly')}</label>
    </div>

    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white md:hidden">
      {visible.map(student => { const tier = warningTier(student); return <details key={student.id} className="group border-b border-slate-100 last:border-0">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
          {student.photo_url ? <img src={student.photo_url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" /> : <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-teal-50 text-xs font-bold text-teal-800">{student.name.slice(0, 1)}</span>}
          <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-900">{student.name}</span><span dir="ltr" className="block text-start text-[11px] text-slate-500">{student.university_number}</span></span>
          <span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-bold ${tier === 3 ? 'bg-rose-50 text-rose-700' : tier === 2 ? 'bg-amber-50 text-amber-800' : 'bg-slate-50 text-slate-700'}`}>{student.total_absent} {bt('workAbsentCount')}</span>
          <ChevronDown size={15} className="shrink-0 text-slate-400 transition group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="space-y-2 border-t border-slate-100 bg-slate-50/70 px-3 py-3">
          <p className="text-xs leading-5 text-slate-600">{bt('workMonthBreakdown', { present: student.present, absent: student.absent, excused: student.excused, late: student.late })}</p>
          {followUp(student)}
        </div>
      </details>; })}
      {!visible.length && <p className="p-6 text-center text-sm text-slate-500">{bt('workMonthlyNoMatches')}</p>}
    </div>

    <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 md:block"><table className="w-full min-w-[700px] text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="p-3 text-start">{bt('workStudentName')}</th><th className="p-3 text-center">{bt('workPresentCount')}</th><th className="p-3 text-center">{bt('workAbsentCount')}</th><th className="p-3 text-center">{bt('workExcusedCount')}</th><th className="p-3 text-center">{bt('workAllAbsences')}</th><th className="p-3 text-start">{bt('workFollowUp')}</th></tr></thead><tbody>{visible.map(student => { const tier = warningTier(student); return <tr key={student.id} className="border-t border-slate-100"><td className="p-3"><span className="font-bold text-slate-900">{student.name}</span><span dir="ltr" className="block text-start text-xs text-slate-500">{student.university_number}</span></td><td className="p-3 text-center">{student.present}</td><td className="p-3 text-center">{student.absent}</td><td className="p-3 text-center">{student.excused}</td><td className={`p-3 text-center font-bold ${tier === 3 ? 'text-rose-700' : tier === 2 ? 'text-amber-700' : 'text-slate-800'}`}>{student.total_absent}</td><td className="p-3">{followUp(student)}</td></tr>; })}</tbody></table>{!visible.length && <p className="p-6 text-center text-sm text-slate-500">{bt('workMonthlyNoMatches')}</p>}</div>

    {pages > 1 && <nav aria-label={bt('workMonthlyPages')} className="flex items-center justify-between gap-2"><button type="button" disabled={page <= 1} onClick={() => setRequestedPage(page - 1)} className="min-h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold disabled:opacity-40">{bt('workPreviousPage')}</button><span className="text-xs text-slate-500">{bt('workPageOf', { page, pages })}</span><button type="button" disabled={page >= pages} onClick={() => setRequestedPage(page + 1)} className="min-h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold disabled:opacity-40">{bt('workNextPage')}</button></nav>}
  </div>;
}
