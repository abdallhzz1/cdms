import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { Archive, ArrowDownToLine, ArrowLeft, ArrowRight, CalendarDays, Copy, ExternalLink, FileText, FolderArchive, Pencil, Plus, QrCode, Search, Trash2, Upload } from 'lucide-react';
import { apiFetch, apiUrl, ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';

type MeetingOption = { id: number; minutes_number: string; meeting_type: string; meeting_date: string; status: string };
type RepositoryFile = { id: number; original_name: string; mime_type: string; file_size: number };
type Repository = { id: number; title: string; description?: string | null; is_active: boolean; allow_download: boolean; last_accessed_at?: string | null; access_count: number; files_count?: number; public_path: string; meetings: MeetingOption[]; files?: RepositoryFile[] };
const field = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100';
const blank = { title: '', description: '', meeting_ids: [] as number[], is_active: true, allow_download: true };

export function MeetingRepositoriesPage() {
  const { can } = useAuth();
  const { locale, t } = useI18n();
  const ar = locale === 'ar';
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteRepo, setDeleteRepo] = useState(false);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState('');

  const list = useQuery({ queryKey: ['meeting-repositories'], queryFn: () => apiFetch<Repository[]>('/meeting-repositories?per_page=100') });
  const meetings = useQuery({ queryKey: ['meetings', 'repository-options'], queryFn: () => apiFetch<MeetingOption[]>('/meetings?per_page=100') });
  const detail = useQuery({ queryKey: ['meeting-repository', selectedId], queryFn: () => apiFetch<Repository>(`/meeting-repositories/${selectedId}`), enabled: selectedId !== null });

  useEffect(() => {
    if (!list.data) return;
    if (selectedId !== null && list.data.some((repository) => repository.id === selectedId)) return;
    setSelectedId(list.data[0]?.id ?? null);
  }, [list.data, selectedId]);

  const fail = (value: unknown) => setError(value instanceof ApiError ? value.message : (ar ? 'تعذر تنفيذ الإجراء.' : 'Action failed.'));
  const refresh = async (id?: number) => { await queryClient.invalidateQueries({ queryKey: ['meeting-repositories'] }); if (id) await queryClient.invalidateQueries({ queryKey: ['meeting-repository', id] }); };
  const save = useMutation({ mutationFn: () => apiFetch<Repository>(editingId ? `/meeting-repositories/${editingId}` : '/meeting-repositories', { method: editingId ? 'PUT' : 'POST', body: form }), onSuccess: async (repository) => { setSelectedId(repository.id); setEditingId(null); setFormOpen(false); setForm(blank); setError(''); await refresh(repository.id); }, onError: fail });
  const update = useMutation({ mutationFn: (body: Record<string, unknown>) => apiFetch<Repository>(`/meeting-repositories/${selectedId}`, { method: 'PUT', body }), onSuccess: async () => { setError(''); await refresh(selectedId ?? undefined); }, onError: fail });
  const upload = useMutation({ mutationFn: (files: File[]) => { const body = new FormData(); files.forEach((file) => body.append('files[]', file)); return apiFetch(`/meeting-repositories/${selectedId}/files`, { method: 'POST', body }); }, onSuccess: async () => { setError(''); await refresh(selectedId ?? undefined); }, onError: fail });
  const removeFile = useMutation({ mutationFn: (fileId: number) => apiFetch(`/meeting-repositories/${selectedId}/files/${fileId}`, { method: 'DELETE' }), onSuccess: async () => refresh(selectedId ?? undefined), onError: fail });
  const archive = useMutation({ mutationFn: () => apiFetch(`/meeting-repositories/${selectedId}`, { method: 'DELETE' }), onSuccess: async () => { setDeleteRepo(false); await refresh(); setSelectedId(null); }, onError: fail });

  if (!can('meetings.manage')) return <ErrorState title={t('state.forbidden.title')} message={t('state.forbidden.message')} />;
  if (list.isLoading) return <LoadingState />;
  if (list.isError) return <ErrorState onRetry={() => list.refetch()} />;

  const repositories = (list.data ?? []).filter((repository) => `${repository.title} ${repository.description ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  const repository = detail.data;
  const startCreate = () => { setEditingId(null); setForm(blank); setFormOpen(true); };
  const startEdit = () => { if (!repository) return; setEditingId(repository.id); setForm({ title: repository.title, description: repository.description ?? '', meeting_ids: repository.meetings.map((meeting) => meeting.id), is_active: repository.is_active, allow_download: repository.allow_download }); setFormOpen(true); };

  return <div className="mx-auto max-w-7xl space-y-4 pb-14">
    <PageHeader title={ar ? 'مستودعات المحاضر' : 'Minutes repositories'} description={ar ? 'تنظيم المحاضر والملفات ومشاركتها.' : 'Organize and share minutes and files.'}><Link to="/meetings" className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">{ar ? <ArrowRight className="me-2 h-4 w-4" /> : <ArrowLeft className="me-2 h-4 w-4" />}{ar ? 'المحاضر' : 'Minutes'}</Link><Button onClick={startCreate}><Plus className="me-2 h-4 w-4" />{ar ? 'مستودع جديد' : 'New repository'}</Button></PageHeader>
    {error && <p className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-xs font-bold text-rose-700">{error}</p>}
    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="self-start overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <label className="relative block border-b border-slate-100 p-3"><Search className="absolute start-6 top-6 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} className={`${field} ps-10`} placeholder={ar ? 'بحث عن مستودع' : 'Search repositories'} /></label>
        {!repositories.length ? <div className="p-5"><EmptyState message={ar ? 'لا توجد مستودعات.' : 'No repositories.'} /></div> : <div className="max-h-[640px] divide-y divide-slate-100 overflow-y-auto">{repositories.map((item) => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={`flex w-full items-center gap-3 p-4 text-start transition ${selectedId === item.id ? 'bg-teal-50' : 'hover:bg-slate-50'}`}><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${item.is_active ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-400'}`}><FolderArchive className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-slate-900">{item.title}</span><span className="mt-1 block text-[10px] font-bold text-slate-400">{item.meetings.length} {ar ? 'محضر' : 'minutes'} · {item.files_count ?? 0} {ar ? 'ملف' : 'files'}</span></span><span className={`text-[10px] font-black ${item.is_active ? 'text-emerald-700' : 'text-slate-400'}`}>{item.is_active ? (ar ? 'فعال' : 'Active') : (ar ? 'متوقف' : 'Off')}</span></button>)}</div>}
      </aside>
      <main>{selectedId === null ? <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-12"><EmptyState message={ar ? 'أنشئ مستودعاً للبدء.' : 'Create a repository to begin.'} /></section> : detail.isLoading ? <LoadingState /> : detail.isError || !repository ? <ErrorState onRetry={() => detail.refetch()} /> : <RepositoryWorkspace repository={repository} ar={ar} onEdit={startEdit} onToggle={() => update.mutate({ is_active: !repository.is_active })} onUpload={(files) => upload.mutate(files)} onRemoveFile={(id) => removeFile.mutate(id)} onArchive={() => setDeleteRepo(true)} busy={update.isPending || upload.isPending} />}</main>
    </div>
    <RepositoryForm isOpen={formOpen} onClose={() => { setEditingId(null); setFormOpen(false); setForm(blank); }} ar={ar} form={form} setForm={setForm} meetings={meetings.data ?? []} onSubmit={() => save.mutate()} busy={save.isPending} editing={editingId !== null} />
    <ConfirmDialog isOpen={deleteRepo} onClose={() => setDeleteRepo(false)} onConfirm={() => archive.mutate()} isDanger isConfirming={archive.isPending} title={ar ? 'أرشفة المستودع' : 'Archive repository'} message={ar ? 'سيتم إيقاف رابط المشاركة.' : 'The sharing link will be disabled.'} />
  </div>;
}

function RepositoryWorkspace({ repository, ar, onEdit, onToggle, onUpload, onRemoveFile, onArchive, busy }: { repository: Repository; ar: boolean; onEdit: () => void; onToggle: () => void; onUpload: (files: File[]) => void; onRemoveFile: (id: number) => void; onArchive: () => void; busy: boolean }) {
  const [qrOpen, setQrOpen] = useState(false);
  const publicUrl = `${window.location.origin}${repository.public_path}`;
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <header className="border-b border-slate-100 p-4 sm:p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-lg font-black text-slate-900">{repository.title}</h2><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${repository.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{repository.is_active ? (ar ? 'المشاركة فعالة' : 'Sharing active') : (ar ? 'المشاركة متوقفة' : 'Sharing off')}</span></div>{repository.description && <p className="mt-1.5 text-xs text-slate-500">{repository.description}</p>}</div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setQrOpen(true)}><QrCode className="me-1.5 h-4 w-4" />{ar ? 'رمز QR' : 'QR code'}</Button><Button size="sm" variant="outline" onClick={onEdit}><Pencil className="me-1.5 h-3.5 w-3.5" />{ar ? 'تعديل' : 'Edit'}</Button><Button size="sm" variant="ghost" onClick={onToggle} disabled={busy}>{repository.is_active ? (ar ? 'إيقاف الرابط' : 'Disable link') : (ar ? 'تفعيل الرابط' : 'Enable link')}</Button><button type="button" onClick={onArchive} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={ar ? 'أرشفة' : 'Archive'}><Archive className="h-4 w-4" /></button></div></div></header>
    <div className="divide-y divide-slate-100">
      <section className="p-4 sm:p-5"><div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-sm font-black text-slate-900">{ar ? 'الملفات' : 'Files'} <span className="font-bold text-slate-400">({repository.files?.length ?? 0})</span></h3><label className="inline-flex h-9 cursor-pointer items-center rounded-lg bg-teal-600 px-3 text-xs font-bold text-white hover:bg-teal-700"><Upload className="me-2 h-4 w-4" />{ar ? 'رفع ملفات' : 'Upload files'}<input type="file" multiple className="sr-only" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.zip" disabled={busy} onChange={(event) => { const files = Array.from(event.target.files ?? []); if (files.length) onUpload(files); event.currentTarget.value = ''; }} /></label></div>{!repository.files?.length ? <div className="rounded-xl bg-slate-50 py-6"><EmptyState message={ar ? 'لا توجد ملفات.' : 'No files.'} /></div> : <div className="divide-y divide-slate-100">{repository.files.map((file) => <div key={file.id} className="flex items-center justify-between gap-3 py-3"><div className="flex min-w-0 items-center gap-3"><span className="rounded-lg bg-slate-100 p-2"><FileText className="h-4 w-4 text-slate-500" /></span><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-800">{file.original_name}</p><p className="text-[10px] text-slate-400">{formatBytes(file.file_size)}</p></div></div><div className="flex gap-1"><a href={apiUrl(`/meeting-repositories/${repository.id}/files/${file.id}/download`)} className="rounded-lg p-2 text-teal-700 hover:bg-teal-50" aria-label={ar ? 'تنزيل' : 'Download'}><ArrowDownToLine className="h-4 w-4" /></a><button type="button" onClick={() => onRemoveFile(file.id)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={ar ? 'إزالة' : 'Remove'}><Trash2 className="h-4 w-4" /></button></div></div>)}</div>}</section>
      <section className="p-4 sm:p-5"><h3 className="text-sm font-black text-slate-900">{ar ? 'المحاضر المرتبطة' : 'Linked minutes'} <span className="font-bold text-slate-400">({repository.meetings.length})</span></h3>{!repository.meetings.length ? <p className="mt-3 text-xs font-bold text-slate-400">{ar ? 'لا توجد محاضر مرتبطة.' : 'No linked minutes.'}</p> : <div className="mt-3 grid gap-2 sm:grid-cols-2">{repository.meetings.map((meeting) => <div key={meeting.id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"><CalendarDays className="h-4 w-4 shrink-0 text-teal-700" /><div className="min-w-0"><p className="truncate text-xs font-black text-slate-800">{meeting.meeting_type}</p><p className="mt-0.5 text-[10px] text-slate-500">{meeting.minutes_number} · {meeting.meeting_date.slice(0, 10)}</p></div></div>)}</div>}</section>
    </div>
    <QrDialog open={qrOpen} close={() => setQrOpen(false)} value={publicUrl} active={repository.is_active} ar={ar} />
  </section>;
}

function QrDialog({ open, close, value, active, ar }: { open: boolean; close: () => void; value: string; active: boolean; ar: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (open && canvas.current) void QRCode.toCanvas(canvas.current, value, { width: 230, margin: 2, color: { dark: '#0f4f4b', light: '#ffffff' } }); }, [open, value]);
  const download = () => { if (!canvas.current) return; const link = document.createElement('a'); link.download = 'meeting-repository-qr.png'; link.href = canvas.current.toDataURL('image/png'); link.click(); };
  return <Modal isOpen={open} onClose={close} title={ar ? 'رمز المشاركة' : 'Share QR code'} maxWidth="sm"><div className="text-center"><div className={`mx-auto w-fit rounded-2xl border border-slate-200 p-2 ${active ? '' : 'opacity-40'}`}><canvas ref={canvas} /></div><div className="mt-4 grid grid-cols-2 gap-2"><Button variant="outline" onClick={async () => { await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }}><Copy className="me-1.5 h-4 w-4" />{copied ? (ar ? 'تم النسخ' : 'Copied') : (ar ? 'نسخ الرابط' : 'Copy link')}</Button><Button onClick={download}><ArrowDownToLine className="me-1.5 h-4 w-4" />{ar ? 'تنزيل' : 'Download'}</Button><a href={value} target="_blank" rel="noreferrer" className="col-span-2 inline-flex h-10 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-700 hover:bg-slate-200"><ExternalLink className="me-1.5 h-4 w-4" />{ar ? 'فتح صفحة المشاركة' : 'Open sharing page'}</a></div></div></Modal>;
}

function RepositoryForm({ isOpen, onClose, ar, form, setForm, meetings, onSubmit, busy, editing }: { isOpen: boolean; onClose: () => void; ar: boolean; form: typeof blank; setForm: (value: typeof blank) => void; meetings: MeetingOption[]; onSubmit: () => void; busy: boolean; editing: boolean }) {
  const approved = meetings.filter((meeting) => meeting.status === 'approved');
  return <Modal isOpen={isOpen} onClose={onClose} title={editing ? (ar ? 'تعديل المستودع' : 'Edit repository') : (ar ? 'مستودع جديد' : 'New repository')} maxWidth="2xl"><form onSubmit={(event: FormEvent) => { event.preventDefault(); onSubmit(); }} className="space-y-4"><label><span className="mb-1.5 block text-xs font-black text-slate-600">{ar ? 'اسم المستودع' : 'Repository name'}</span><input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className={field} /></label><label><span className="mb-1.5 block text-xs font-black text-slate-600">{ar ? 'وصف اختياري' : 'Optional description'}</span><textarea rows={2} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={`${field} h-auto py-3`} /></label><div><p className="mb-2 text-xs font-black text-slate-600">{ar ? 'المحاضر' : 'Minutes'}</p><div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">{approved.length === 0 ? <p className="p-3 text-center text-[11px] font-bold text-slate-500">{ar ? 'لا توجد محاضر معتمدة.' : 'No approved minutes.'}</p> : approved.map((meeting) => <label key={meeting.id} className="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-slate-50"><input type="checkbox" checked={form.meeting_ids.includes(meeting.id)} onChange={() => setForm({ ...form, meeting_ids: form.meeting_ids.includes(meeting.id) ? form.meeting_ids.filter((id) => id !== meeting.id) : [...form.meeting_ids, meeting.id] })} className="h-4 w-4 rounded border-slate-300 text-teal-600" /><span className="min-w-0"><span className="block truncate text-xs font-bold text-slate-800">{meeting.meeting_type}</span><span className="text-[10px] text-slate-500">{meeting.minutes_number} · {meeting.meeting_date.slice(0, 10)}</span></span></label>)}</div></div><div className="flex flex-wrap gap-5"><label className="flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />{ar ? 'الرابط فعال' : 'Link active'}</label><label className="flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={form.allow_download} onChange={(event) => setForm({ ...form, allow_download: event.target.checked })} />{ar ? 'السماح بالتنزيل' : 'Allow downloads'}</label></div><div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><Button type="button" variant="outline" onClick={onClose}>{ar ? 'إلغاء' : 'Cancel'}</Button><Button type="submit" isLoading={busy}>{ar ? 'حفظ' : 'Save'}</Button></div></form></Modal>;
}

function formatBytes(value: number) { if (value < 1024) return `${value} B`; if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`; return `${(value / 1024 / 1024).toFixed(1)} MB`; }
