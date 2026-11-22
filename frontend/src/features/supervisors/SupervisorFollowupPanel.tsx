import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Plus, ShieldCheck } from 'lucide-react';
import { apiFetch, downloadApiFile, ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';

type RecordItem = {
  id: number; type: string; title: string; body: string; status: string; record_date: string; end_date?: string;
  visible_to_supervisor: boolean; created_at: string; review_note?: string; reviewed_at?: string;
  supervisor_user_id: number; supervisor: { id: number; name: string }; author: { name: string }; reviewer?: { name: string };
  site?: { name_ar: string; name_en?: string }; can_review: boolean; can_delete: boolean;
  files: Array<{ id: number; name: string; download_url: string; size_bytes: number }>;
};
type Page = { items: RecordItem[]; current_page: number; last_page: number; total: number };
const fieldClass = 'w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100';
const errorText = (error: unknown) => error instanceof ApiError ? Object.values(error.errors).flat().find(item => typeof item === 'string') as string || error.message : error instanceof Error ? error.message : '';

export function SupervisorFollowupPanel({ supervisorId }: { supervisorId?: number }) {
  const { user, can } = useAuth();
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const tr = (arabic: string, english: string) => ar ? arabic : english;
  const client = useQueryClient();
  const self = supervisorId === user?.id;
  const [status, setStatus] = useState(supervisorId ? '' : 'submitted');
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ type: 'excuse', title: '', body: '', record_date: '', end_date: '', visible_to_supervisor: false });
  const [files, setFiles] = useState<File[]>([]);
  const [reviewing, setReviewing] = useState<RecordItem | null>(null);
  const [decision, setDecision] = useState('approved');
  const [reviewNote, setReviewNote] = useState('');
  const [deleting, setDeleting] = useState<RecordItem | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const types: Record<string, string> = { excuse: tr('عذر', 'Excuse'), absence: tr('غياب', 'Absence'), note: tr('ملاحظة إدارية', 'Administrative note'), file: tr('ملف إداري', 'Administrative file') };
  const statuses: Record<string, string> = { submitted: tr('بانتظار المراجعة', 'Awaiting review'), approved: tr('مقبول', 'Approved'), rejected: tr('مرفوض', 'Rejected'), recorded: tr('مسجّل', 'Recorded') };
  const query = useQuery({
    queryKey: ['supervisor-followup', supervisorId, status, page],
    queryFn: () => apiFetch<Page>(`/supervisor-followup?page=${page}${supervisorId ? `&supervisor_user_id=${supervisorId}` : ''}${status ? `&status=${status}` : ''}`),
  });
  const refresh = () => client.invalidateQueries({ queryKey: ['supervisor-followup'] });
  const add = useMutation({
    mutationFn: () => {
      const data = new FormData();
      data.append('supervisor_user_id', String(supervisorId));
      Object.entries(draft).forEach(([key, value]) => { if (value !== '') data.append(key, typeof value === 'boolean' ? (value ? '1' : '0') : value); });
      files.forEach(file => data.append('files[]', file));
      return apiFetch('/supervisor-followup', { method: 'POST', body: data });
    },
    onSuccess: async () => { setAdding(false); setNotice(tr('تم حفظ السجل. يظهر العذر ضمن طلبات المراجعة.', 'Record saved. Excuses appear in the review inbox.')); await refresh(); },
    onError: err => setError(errorText(err)),
  });
  const review = useMutation({
    mutationFn: () => apiFetch(`/supervisor-followup/${reviewing!.id}/review`, { method: 'POST', body: { decision, review_note: reviewNote } }),
    onSuccess: async () => { setReviewing(null); setNotice(tr('تم تسجيل القرار.', 'Decision recorded.')); await refresh(); },
    onError: err => setError(errorText(err)),
  });
  const remove = useMutation({
    mutationFn: () => apiFetch(`/supervisor-followup/${deleting!.id}`, { method: 'DELETE', body: { reason: deleteReason } }),
    onSuccess: async () => { setDeleting(null); setNotice(tr('تم حذف السجل وحفظ الإجراء في سجل التدقيق.', 'Record removed; the action remains in the audit history.')); await refresh(); },
    onError: err => setError(errorText(err)),
  });
  const download = useMutation({ mutationFn: (file: RecordItem['files'][number]) => downloadApiFile(file.download_url, file.name), onError: err => setError(errorText(err)) });
  const openAdd = () => {
    setDraft({ type: 'excuse', title: '', body: '', record_date: '', end_date: '', visible_to_supervisor: false });
    setFiles([]); setError(''); setNotice(''); setAdding(true);
  };
  const busy = add.isPending || review.isPending || remove.isPending;
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-base font-black text-slate-900">{self ? tr('أعذاري ومتابعتي', 'My excuses and follow-up') : tr('المتابعة والأعذار', 'Follow-up and excuses')}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{self ? tr('أرسل عذرك وتابع قرار المراجعة هنا.', 'Submit your excuse and follow its review here.') : tr('الأعذار والملاحظات والملفات المسجلة للمشرفين.', 'Excuses, notes and files recorded for supervisors.')}</p></div>
      {supervisorId && (self || can('supervisor_records.create')) && <Button onClick={openAdd}><Plus className="me-1 h-4 w-4" />{self ? tr('إرسال عذر', 'Submit excuse') : tr('إضافة سجل أو عذر', 'Add record or excuse')}</Button>}
    </div>
    {notice && <p role="status" className="rounded-xl bg-teal-50 p-3 text-sm text-teal-800">{notice}</p>}
    {error && !adding && !reviewing && !deleting && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <label className="flex items-center gap-3 text-xs font-bold text-slate-600">{tr('الحالة', 'Status')}<select className={`${fieldClass} max-w-xs`} value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">{tr('الكل', 'All')}</option>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    {query.isLoading ? <LoadingState /> : query.isError ? <ErrorState onRetry={() => query.refetch()} /> : <div className="space-y-3">
      {!query.data?.items.length && <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">{tr('لا توجد سجلات ضمن هذا الاختيار.', 'No records match this selection.')}</p>}
      {query.data?.items.map(record => <details key={record.id} className="group rounded-2xl border border-slate-200 bg-white open:shadow-sm">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 p-4">
          <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">{types[record.type]}</span>
          <span className="min-w-0 flex-1 text-sm font-bold text-slate-900">{record.title}</span>
          <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${record.status === 'submitted' ? 'bg-amber-50 text-amber-800' : record.status === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-teal-50 text-teal-800'}`}>{statuses[record.status]}</span>
          <span className="w-full text-xs text-slate-500">{!supervisorId && `${record.supervisor.name} · `}{record.record_date}{record.end_date ? ` — ${record.end_date}` : ''}</span>
        </summary>
        <div className="space-y-4 border-t border-slate-100 p-4">
          {!supervisorId && <Link className="text-xs font-bold text-teal-700 underline" to={`/clinical-supervisors/${record.supervisor_user_id}?tab=followup`}>{tr('فتح ملف المشرف', 'Open supervisor profile')}</Link>}
          <p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{record.body}</p>
          <p className="text-xs text-slate-500">{tr('أُدخل بواسطة', 'Recorded by')} {record.author.name} · {record.created_at.slice(0, 10)}{record.site ? ` · ${ar ? record.site.name_ar : record.site.name_en || record.site.name_ar}` : ''}{!record.visible_to_supervisor ? ` · ${tr('داخلي', 'Internal')}` : ''}</p>
          {!!record.files.length && <div className="flex flex-wrap gap-2">{record.files.map(file => <button type="button" disabled={download.isPending} onClick={() => { setError(''); download.mutate(file); }} key={file.id} className="inline-flex max-w-full items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-teal-800 disabled:opacity-40"><Download className="h-4 w-4 shrink-0" /><span className="break-all">{file.name}</span></button>)}</div>}
          {record.review_note && <div className="rounded-xl bg-slate-50 p-3"><p className="flex items-center gap-2 text-xs font-bold text-slate-600"><ShieldCheck className="h-4 w-4" />{tr('قرار المراجعة', 'Review decision')} · {record.reviewer?.name} · {record.reviewed_at?.slice(0, 10)}</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{record.review_note}</p></div>}
          <div className="flex flex-wrap gap-2">{record.can_review && <Button onClick={() => { setReviewing(record); setReviewNote(''); setDecision('approved'); setError(''); }}>{tr('مراجعة العذر', 'Review excuse')}</Button>}{record.can_delete && <Button variant="outline" onClick={() => { setDeleting(record); setDeleteReason(''); setError(''); }}>{tr('حذف السجل', 'Delete record')}</Button>}</div>
        </div>
      </details>)}
    </div>}
    {query.data && query.data.last_page > 1 && <div className="flex items-center justify-between gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>{tr('السابق', 'Previous')}</Button><span className="text-xs text-slate-500">{page} / {query.data.last_page}</span><Button variant="outline" disabled={page >= query.data.last_page} onClick={() => setPage(page + 1)}>{tr('التالي', 'Next')}</Button></div>}
    <Modal isOpen={adding} onClose={() => { if (!busy) setAdding(false); }} title={self ? tr('إرسال عذر', 'Submit excuse') : tr('إضافة سجل للمشرف', 'Add supervisor record')} maxWidth="lg">
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); setError(''); add.mutate(); }}>
        {!self && <label className="block space-y-1 text-xs font-bold">{tr('نوع السجل', 'Record type')}<select className={fieldClass} value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value })}>{Object.entries(types).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
        <div className="grid gap-3 sm:grid-cols-2"><label className="block space-y-1 text-xs font-bold">{tr('التاريخ', 'Date')}<input required type="date" className={fieldClass} value={draft.record_date} onChange={e => setDraft({ ...draft, record_date: e.target.value })} /></label>{draft.type === 'excuse' && <label className="block space-y-1 text-xs font-bold">{tr('إلى تاريخ (اختياري)', 'End date (optional)')}<input type="date" min={draft.record_date} className={fieldClass} value={draft.end_date} onChange={e => setDraft({ ...draft, end_date: e.target.value })} /></label>}</div>
        <label className="block space-y-1 text-xs font-bold">{tr('العنوان', 'Title')}<input required maxLength={255} className={fieldClass} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
        <label className="block space-y-1 text-xs font-bold">{tr('التفاصيل', 'Details')}<textarea required rows={4} maxLength={10000} className={`${fieldClass} resize-y`} value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} /></label>
        <label className="block space-y-1 text-xs font-bold">{tr('المرفقات (حتى 5 ملفات، 10MB لكل ملف)', 'Attachments (up to 5 files, 10MB each)')}<input className={`${fieldClass} text-xs`} type="file" multiple required={draft.type === 'file'} accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.zip" onChange={e => setFiles(Array.from(e.target.files || []))} /></label>
        {!self && draft.type !== 'excuse' && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={draft.visible_to_supervisor} onChange={e => setDraft({ ...draft, visible_to_supervisor: e.target.checked })} />{tr('إظهار السجل للمشرف', 'Share this record with the supervisor')}</label>}
        {draft.type === 'excuse' && <p className="text-xs leading-5 text-slate-500">{tr('سيُرسل العذر للمراجعة، وتظهر نتيجته للمشرف. يراجعه مستخدم مخول غير الذي أرسله.', 'The excuse will be reviewed by another authorized user. Its decision is visible to the supervisor.')}</p>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2"><Button variant="outline" type="button" onClick={() => setAdding(false)} disabled={busy}>{tr('إلغاء', 'Cancel')}</Button><Button type="submit" isLoading={add.isPending} disabled={files.length > 5 || files.some(file => file.size > 10 * 1024 * 1024)}>{draft.type === 'excuse' ? tr('إرسال للمراجعة', 'Submit for review') : tr('حفظ السجل', 'Save record')}</Button></div>
        {(files.length > 5 || files.some(file => file.size > 10 * 1024 * 1024)) && <p role="alert" className="text-xs text-red-700">{tr('راجع عدد الملفات وحجمها قبل الإرسال.', 'Check the attachment count and size before submitting.')}</p>}
      </form>
    </Modal>
    <Modal isOpen={!!reviewing} onClose={() => { if (!busy) setReviewing(null); }} title={tr('مراجعة العذر', 'Review excuse')} maxWidth="md"><form className="space-y-4" onSubmit={e => { e.preventDefault(); setError(''); review.mutate(); }}><p className="text-sm font-bold">{reviewing?.title}</p><label className="block space-y-1 text-xs font-bold">{tr('القرار', 'Decision')}<select className={fieldClass} value={decision} onChange={e => setDecision(e.target.value)}><option value="approved">{tr('قبول العذر', 'Approve excuse')}</option><option value="rejected">{tr('رفض العذر', 'Reject excuse')}</option></select></label><label className="block space-y-1 text-xs font-bold">{tr('سبب القرار / ملاحظة المراجعة', 'Decision reason / review note')}<textarea className={fieldClass} required rows={3} maxLength={5000} value={reviewNote} onChange={e => setReviewNote(e.target.value)} /></label>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<Button type="submit" isLoading={review.isPending}>{tr('تسجيل القرار', 'Record decision')}</Button></form></Modal>
    <Modal isOpen={!!deleting} onClose={() => { if (!busy) setDeleting(null); }} title={tr('حذف السجل', 'Delete record')} maxWidth="md"><form className="space-y-4" onSubmit={e => { e.preventDefault(); setError(''); remove.mutate(); }}><p className="text-sm">{deleting?.title}</p><label className="block space-y-1 text-xs font-bold">{tr('سبب الحذف', 'Reason for deletion')}<textarea className={fieldClass} required minLength={5} maxLength={2000} value={deleteReason} onChange={e => setDeleteReason(e.target.value)} /></label>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<Button type="submit" variant="danger" isLoading={remove.isPending}>{tr('تأكيد الحذف', 'Confirm deletion')}</Button></form></Modal>
  </section>;
}
