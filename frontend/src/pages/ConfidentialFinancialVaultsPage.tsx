import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { ArrowDownToLine, Copy, ExternalLink, FileText, KeyRound, LockKeyhole, Pencil, Plus, QrCode, Search, Trash2, Upload } from 'lucide-react';
import { apiFetch, apiUrl, ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';

type VaultFile = { id: number; original_name: string; mime_type: string; file_size: number };
type Vault = { id: number; title: string; description?: string | null; is_active: boolean; successful_access_count: number; last_accessed_at?: string | null; files_count?: number; files?: VaultFile[]; public_path: string };
const emptyForm = { title: '', description: '', password: '', password_confirmation: '', is_active: true };
const input = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100';

export function ConfidentialFinancialVaultsPage() {
  const { can } = useAuth();
  const { locale, t } = useI18n();
  const ar = locale === 'ar';
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  const list = useQuery({ queryKey: ['confidential-financial-vaults'], queryFn: () => apiFetch<Vault[]>('/confidential-financial-vaults') });
  const detail = useQuery({ queryKey: ['confidential-financial-vault', selectedId], queryFn: () => apiFetch<Vault>(`/confidential-financial-vaults/${selectedId}`), enabled: selectedId !== null });

  useEffect(() => {
    if (!list.data) return;
    if (selectedId !== null && list.data.some((vault) => vault.id === selectedId)) return;
    setSelectedId(list.data[0]?.id ?? null);
  }, [list.data, selectedId]);

  const fail = (value: unknown) => setError(value instanceof ApiError ? value.message : (ar ? 'تعذر تنفيذ الإجراء.' : 'Action failed.'));
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['confidential-financial-vaults'] });
    if (selectedId) await queryClient.invalidateQueries({ queryKey: ['confidential-financial-vault', selectedId] });
  };
  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { title: form.title, description: form.description || null, is_active: form.is_active };
      if (form.password) Object.assign(body, { password: form.password, password_confirmation: form.password_confirmation });
      return apiFetch<Vault>(editing ? `/confidential-financial-vaults/${selectedId}` : '/confidential-financial-vaults', { method: editing ? 'PUT' : 'POST', body });
    },
    onSuccess: async (vault) => { setSelectedId(vault.id); setFormOpen(false); setForm(emptyForm); setError(''); await refresh(); },
    onError: fail,
  });
  const toggle = useMutation({ mutationFn: (active: boolean) => apiFetch(`/confidential-financial-vaults/${selectedId}`, { method: 'PUT', body: { is_active: active } }), onSuccess: async () => { setError(''); await refresh(); }, onError: fail });
  const upload = useMutation({ mutationFn: (files: File[]) => { const body = new FormData(); files.forEach((file) => body.append('files[]', file)); return apiFetch(`/confidential-financial-vaults/${selectedId}/files`, { method: 'POST', body }); }, onSuccess: async () => { setError(''); await refresh(); }, onError: fail });
  const remove = useMutation({ mutationFn: (id: number) => apiFetch(`/confidential-financial-vaults/${selectedId}/files/${id}`, { method: 'DELETE' }), onSuccess: refresh, onError: fail });

  if (!can('confidential_finance.manage')) return <ErrorState title={t('state.forbidden.title')} message={t('state.forbidden.message')} />;
  if (list.isLoading) return <LoadingState />;
  if (list.isError) return <ErrorState onRetry={() => list.refetch()} />;

  const rows = (list.data ?? []).filter((vault) => `${vault.title} ${vault.description ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  const vault = detail.data;
  const create = () => { setEditing(false); setForm(emptyForm); setFormOpen(true); };
  const edit = () => { if (!vault) return; setEditing(true); setForm({ title: vault.title, description: vault.description ?? '', password: '', password_confirmation: '', is_active: vault.is_active }); setFormOpen(true); };

  return <div className="mx-auto max-w-7xl space-y-4 pb-14">
    <PageHeader title={ar ? 'الخزنة المالية' : 'Financial vault'} description={ar ? 'إدارة الملفات المحمية وروابط الوصول.' : 'Manage protected files and access links.'}><Button onClick={create}><Plus className="me-2 h-4 w-4" />{ar ? 'خزنة جديدة' : 'New vault'}</Button></PageHeader>
    {error && <p className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-xs font-bold text-rose-700">{error}</p>}
    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="self-start overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <label className="relative block border-b border-slate-100 p-3"><Search className="absolute start-6 top-6 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} className={`${input} ps-10`} placeholder={ar ? 'بحث عن خزنة' : 'Search vaults'} /></label>
        {rows.length === 0 ? <div className="p-5"><EmptyState message={ar ? 'لا توجد خزائن.' : 'No vaults.'} /></div> : <div className="max-h-[640px] divide-y divide-slate-100 overflow-y-auto">{rows.map((item) => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={`flex w-full items-center gap-3 p-4 text-start transition ${selectedId === item.id ? 'bg-teal-50' : 'hover:bg-slate-50'}`}><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${item.is_active ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-400'}`}><LockKeyhole className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-slate-900">{item.title}</span><span className="mt-1 block text-[10px] font-bold text-slate-400">{item.files_count ?? 0} {ar ? 'ملف' : 'files'}</span></span><span className={`text-[10px] font-black ${item.is_active ? 'text-emerald-700' : 'text-slate-400'}`}>{item.is_active ? (ar ? 'فعالة' : 'Active') : (ar ? 'متوقفة' : 'Off')}</span></button>)}</div>}
      </aside>
      <main>{selectedId === null ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12"><EmptyState message={ar ? 'أنشئ خزنة للبدء.' : 'Create a vault to begin.'} /></div> : detail.isLoading ? <LoadingState /> : !vault || detail.isError ? <ErrorState onRetry={() => detail.refetch()} /> : <VaultWorkspace vault={vault} ar={ar} onEdit={edit} onToggle={() => toggle.mutate(!vault.is_active)} onUpload={(files) => upload.mutate(files)} onRemove={(id) => remove.mutate(id)} busy={toggle.isPending || upload.isPending} />}</main>
    </div>
    <VaultForm open={formOpen} close={() => { setFormOpen(false); setForm(emptyForm); }} ar={ar} form={form} setForm={setForm} editing={editing} save={() => save.mutate()} busy={save.isPending} />
  </div>;
}

function VaultWorkspace({ vault, ar, onEdit, onToggle, onUpload, onRemove, busy }: { vault: Vault; ar: boolean; onEdit: () => void; onToggle: () => void; onUpload: (files: File[]) => void; onRemove: (id: number) => void; busy: boolean }) {
  const [qrOpen, setQrOpen] = useState(false);
  const publicUrl = `${window.location.origin}${vault.public_path}`;
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <header className="border-b border-slate-100 p-4 sm:p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-lg font-black text-slate-900">{vault.title}</h2><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${vault.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{vault.is_active ? (ar ? 'فعالة' : 'Active') : (ar ? 'متوقفة' : 'Disabled')}</span></div>{vault.description && <p className="mt-1.5 text-xs text-slate-500">{vault.description}</p>}</div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setQrOpen(true)}><QrCode className="me-1.5 h-4 w-4" />{ar ? 'رمز QR' : 'QR code'}</Button><Button size="sm" variant="outline" onClick={onEdit}><Pencil className="me-1.5 h-3.5 w-3.5" />{ar ? 'تعديل' : 'Edit'}</Button><Button size="sm" variant="ghost" onClick={onToggle} disabled={busy}>{vault.is_active ? (ar ? 'إيقاف الرابط' : 'Disable link') : (ar ? 'تفعيل الرابط' : 'Enable link')}</Button></div></div></header>
    <div className="p-4 sm:p-5"><div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-sm font-black text-slate-900">{ar ? 'الملفات' : 'Files'} <span className="font-bold text-slate-400">({vault.files?.length ?? 0})</span></h3><label className="inline-flex h-9 cursor-pointer items-center rounded-lg bg-teal-600 px-3 text-xs font-bold text-white hover:bg-teal-700"><Upload className="me-2 h-4 w-4" />{ar ? 'رفع ملفات' : 'Upload files'}<input type="file" multiple className="sr-only" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.zip" disabled={busy} onChange={(event) => { const files = Array.from(event.target.files ?? []); if (files.length) onUpload(files); event.currentTarget.value = ''; }} /></label></div>
      {!vault.files?.length ? <div className="rounded-xl bg-slate-50 py-6"><EmptyState message={ar ? 'لا توجد ملفات.' : 'No files.'} /></div> : <div className="divide-y divide-slate-100">{vault.files.map((file) => <div key={file.id} className="flex items-center justify-between gap-3 py-3"><div className="flex min-w-0 items-center gap-3"><span className="rounded-lg bg-slate-100 p-2"><FileText className="h-4 w-4 text-slate-500" /></span><div className="min-w-0"><p className="truncate text-xs font-black text-slate-800">{file.original_name}</p><p className="text-[10px] text-slate-400">{formatBytes(file.file_size, ar)}</p></div></div><div className="flex gap-1"><a href={apiUrl(`/confidential-financial-vaults/${vault.id}/files/${file.id}/download`)} className="rounded-lg p-2 text-teal-700 hover:bg-teal-50" aria-label={ar ? 'تنزيل' : 'Download'}><ArrowDownToLine className="h-4 w-4" /></a><button type="button" onClick={() => onRemove(file.id)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={ar ? 'إزالة' : 'Remove'}><Trash2 className="h-4 w-4" /></button></div></div>)}</div>}
    </div>
    <QrDialog open={qrOpen} close={() => setQrOpen(false)} value={publicUrl} active={vault.is_active} ar={ar} />
  </section>;
}

function QrDialog({ open, close, value, active, ar }: { open: boolean; close: () => void; value: string; active: boolean; ar: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (open && canvas.current) void QRCode.toCanvas(canvas.current, value, { width: 230, margin: 2, color: { dark: '#143f3c', light: '#ffffff' } }); }, [open, value]);
  const download = () => { if (!canvas.current) return; const link = document.createElement('a'); link.download = 'confidential-financial-qr.png'; link.href = canvas.current.toDataURL('image/png'); link.click(); };
  return <Modal isOpen={open} onClose={close} title={ar ? 'رمز الوصول' : 'Access QR code'} maxWidth="sm"><div className="text-center"><div className={`mx-auto w-fit rounded-2xl border border-slate-200 p-2 ${active ? '' : 'opacity-40'}`}><canvas ref={canvas} /></div><div className="mt-4 grid grid-cols-2 gap-2"><Button variant="outline" onClick={async () => { await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }}><Copy className="me-1.5 h-4 w-4" />{copied ? (ar ? 'تم النسخ' : 'Copied') : (ar ? 'نسخ الرابط' : 'Copy link')}</Button><Button onClick={download}><ArrowDownToLine className="me-1.5 h-4 w-4" />{ar ? 'تنزيل' : 'Download'}</Button><a href={value} target="_blank" rel="noreferrer" className="col-span-2 inline-flex h-10 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-700 hover:bg-slate-200"><ExternalLink className="me-1.5 h-4 w-4" />{ar ? 'فتح صفحة الوصول' : 'Open access page'}</a></div></div></Modal>;
}

function VaultForm({ open, close, ar, form, setForm, editing, save, busy }: { open: boolean; close: () => void; ar: boolean; form: typeof emptyForm; setForm: (value: typeof emptyForm) => void; editing: boolean; save: () => void; busy: boolean }) {
  return <Modal isOpen={open} onClose={close} title={editing ? (ar ? 'تعديل الخزنة' : 'Edit vault') : (ar ? 'خزنة جديدة' : 'New vault')} maxWidth="lg"><form onSubmit={(event: FormEvent) => { event.preventDefault(); save(); }} className="space-y-4"><label><span className="mb-1 block text-xs font-black text-slate-600">{ar ? 'اسم الخزنة' : 'Vault name'}</span><input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className={input} /></label><label><span className="mb-1 block text-xs font-black text-slate-600">{ar ? 'وصف اختياري' : 'Optional description'}</span><textarea rows={2} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={`${input} h-auto py-3`} /></label><div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1 block text-xs font-black text-slate-600">{editing ? (ar ? 'كلمة مرور جديدة' : 'New password') : (ar ? 'كلمة المرور' : 'Password')}</span><input type="password" required={!editing} minLength={12} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete="new-password" className={input} /></label><label><span className="mb-1 block text-xs font-black text-slate-600">{ar ? 'تأكيد كلمة المرور' : 'Confirm password'}</span><input type="password" required={!editing || Boolean(form.password)} minLength={12} value={form.password_confirmation} onChange={(event) => setForm({ ...form, password_confirmation: event.target.value })} autoComplete="new-password" className={input} /></label></div><p className="flex items-start gap-2 text-[10px] font-bold leading-5 text-slate-500"><KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />{ar ? '12 حرفاً على الأقل، مع حرف كبير وصغير ورقم ورمز.' : 'At least 12 characters with upper and lower case, a number, and a symbol.'}</p><label className="flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />{ar ? 'الرابط فعال' : 'Link active'}</label><div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={close}>{ar ? 'إلغاء' : 'Cancel'}</Button><Button type="submit" isLoading={busy}>{ar ? 'حفظ' : 'Save'}</Button></div></form></Modal>;
}

function formatBytes(value: number, ar: boolean) { if (value < 1024) return `${value} ${ar ? 'بايت' : 'B'}`; if (value < 1024 * 1024) return `${Math.round(value / 1024)} ${ar ? 'ك.ب' : 'KB'}`; return `${(value / 1024 / 1024).toFixed(1)} ${ar ? 'م.ب' : 'MB'}`; }
