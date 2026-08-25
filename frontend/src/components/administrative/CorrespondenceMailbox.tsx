import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Archive, ChevronLeft, ChevronRight, FileText, Inbox, Mail, Paperclip, Plus, Search, Send, X } from 'lucide-react';
import { apiFetch, ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';

type MailboxMode = 'inbox' | 'outbox';
type Folder = 'inbox' | 'outbox' | 'drafts' | 'archive';
type UserOption = { id: number; name: string; email: string };
type Item = { id: number; reference_number: string; subject: string; summary?: string | null; status: string; priority: string; correspondence_date: string; response_due_date?: string | null; read_at?: string | null; mail_unread?: boolean; sender?: UserOption | null; assignee?: UserOption | null; latest_message?: { sender_id: number; recipient_id?: number | null; body: string; created_at: string; sender?: UserOption | null; recipient?: UserOption | null } | null };

const fieldClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100';

export function CorrespondenceMailbox({ mode }: { mode: MailboxMode }) {
  const { can, user } = useAuth();
  const { locale, t } = useI18n();
  const ar = locale === 'ar';
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [params] = useSearchParams();
  const requestedRecipient = mode === 'outbox' ? params.get('to') || '' : '';
  const requestedFolder = params.get('folder');
  const folder: Folder = requestedFolder === 'drafts' || requestedFolder === 'archive' ? requestedFolder : mode;
  const [search, setSearch] = useState('');
  const [composeOpen, setComposeOpen] = useState(Boolean(requestedRecipient));
  const [submitError, setSubmitError] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const emptyForm = { assigned_to: '', subject: '', summary: '', priority: 'normal', response_due_date: '' };
  const [form, setForm] = useState({ ...emptyForm, assigned_to: requestedRecipient });

  const queryString = useMemo(() => {
    const query = new URLSearchParams({ filter: folder, per_page: '100' });
    if (search.trim()) query.set('search', search.trim());
    return query.toString();
  }, [folder, search]);
  const { data = [], isLoading, isError, refetch } = useQuery({ queryKey: ['correspondence-mailbox', folder, queryString], queryFn: () => apiFetch<Item[]>(`/correspondence?${queryString}`) });
  const items = Array.isArray(data) ? data : [];
  const { data: users = [] } = useQuery({ queryKey: ['users-lookup', 'correspondence'], queryFn: () => apiFetch<UserOption[]>('/users/lookup?purpose=correspondence'), enabled: composeOpen });
  const recipients = Array.isArray(users) ? users : [];

  const create = useMutation({
    mutationFn: async (sendNow: boolean) => {
      const created = await apiFetch<Item>('/correspondence', { method: 'POST', body: {
        direction: 'internal', category: 'general', subject: form.subject.trim(), summary: form.summary.trim(), priority: form.priority,
        response_due_date: form.response_due_date || null, correspondence_date: new Date().toISOString().slice(0, 10), assigned_to: sendNow ? Number(form.assigned_to) : null,
      } });
      if (attachment) { const body = new FormData(); body.append('file', attachment); await apiFetch(`/correspondence/${created.id}/attachments`, { method: 'POST', body }); }
      return created;
    },
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['correspondence-mailbox'] }); setComposeOpen(false); setSubmitError(''); setAttachment(null); setForm(emptyForm); },
    onError: error => setSubmitError(error instanceof ApiError ? error.message : ar ? 'تعذر حفظ الرسالة.' : 'Unable to save message.'),
  });

  if (!can('correspondence.view')) return <ErrorState title={t('state.forbidden.title')} message={t('state.forbidden.message')} />;
  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const personName = (value?: UserOption | null) => value?.name || value?.email || '—';
  const formatDate = (value?: string | null) => value ? new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value)) : '—';
  const folderTitle = { inbox: ar ? 'البريد الوارد' : 'Inbox', outbox: ar ? 'البريد المرسل' : 'Sent', drafts: ar ? 'المسودات' : 'Drafts', archive: ar ? 'الأرشيف' : 'Archive' }[folder];
  const folders = [
    { key: 'inbox', label: ar ? 'الوارد' : 'Inbox', icon: Inbox, to: '/inbox' },
    { key: 'outbox', label: ar ? 'المرسل' : 'Sent', icon: Send, to: '/outbox' },
    { key: 'drafts', label: ar ? 'المسودات' : 'Drafts', icon: FileText, to: '/outbox?folder=drafts' },
    { key: 'archive', label: ar ? 'الأرشيف' : 'Archive', icon: Archive, to: '/inbox?folder=archive' },
  ];

  return <div className="mx-auto max-w-[1320px] pb-10">
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-2xl font-bold text-slate-900">{ar ? 'المراسلات' : 'Mail'}</h1><p className="mt-1 text-sm text-slate-500">{ar ? 'تواصل داخلي بسيط وآمن بين مستخدمي النظام.' : 'Simple, secure internal communication.'}</p></div>{can('correspondence.create') && <Button onClick={() => setComposeOpen(true)}><Plus className="me-2 h-4 w-4" />{ar ? 'رسالة جديدة' : 'New message'}</Button>}</div>
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid lg:min-h-[620px] lg:grid-cols-[210px_1fr]">
      <aside className="border-b border-slate-100 bg-slate-50/50 p-3 lg:border-b-0 lg:border-e"><nav className="flex gap-2 overflow-x-auto lg:flex-col">{folders.map(({ key, label, icon: Icon, to }) => <Link key={key} to={to} className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${folder === key ? 'bg-teal-100 text-teal-800' : 'text-slate-600 hover:bg-teal-50 hover:text-teal-700'}`}><Icon className="h-4 w-4" />{label}</Link>)}</nav></aside>
      <section className="min-w-0"><div className="border-b border-slate-100 p-4"><h2 className="mb-3 font-bold text-slate-800">{folderTitle}</h2><label className="relative block"><Search className="absolute start-3 top-3 h-4 w-4 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} className={`${fieldClass} ps-10`} placeholder={ar ? 'ابحث باسم المرسل أو الموضوع أو الرقم...' : 'Search sender, subject, or reference...'} /></label></div>
        {!items.length ? <div className="p-8"><EmptyState message={ar ? 'لا توجد رسائل هنا.' : 'No messages here.'} /></div> : <div className="divide-y divide-slate-100">{items.map(item => {
          const latest = item.latest_message;
          let latestParty: UserOption | null | undefined = null;
          if (latest) {
            if (latest.sender_id === user?.id) latestParty = latest.recipient;
            else if (latest.recipient_id === user?.id) latestParty = latest.sender;
          }
          const party = latestParty || (folder === 'outbox' || folder === 'drafts' ? item.assignee : item.sender);
          const unread = folder === 'inbox' && Boolean(item.mail_unread); const preview = latest?.body || item.summary;
          return <Link key={item.id} to={`/correspondence/${item.id}`} className={`group grid gap-2 p-4 transition hover:bg-teal-50/40 sm:grid-cols-[minmax(130px,210px)_1fr_auto] sm:items-center ${unread ? 'bg-teal-50/60' : ''}`}><div className="flex min-w-0 items-center gap-3"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${unread ? 'bg-teal-600 text-white' : 'bg-teal-50 text-teal-700'}`}><Mail className="h-4 w-4" /></span><span className={`truncate text-sm ${unread ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>{folder === 'drafts' ? (ar ? 'مسودة' : 'Draft') : personName(party)}</span></div><div className="min-w-0"><div className="flex min-w-0 items-center gap-2"><span className={`truncate text-sm ${unread ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'}`}>{item.subject}</span>{['urgent', 'critical'].includes(item.priority) && <span className="shrink-0 rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700">{ar ? 'عاجل' : 'Urgent'}</span>}</div><p className="mt-1 truncate text-xs text-slate-500">{preview || (ar ? 'بدون نص' : 'No message')}</p></div><div className="flex items-center justify-between gap-3 text-xs text-slate-400 sm:justify-end"><span>{formatDate(latest?.created_at || item.correspondence_date)}</span>{ar ? <ChevronLeft className="h-4 w-4 text-teal-600 opacity-0 transition group-hover:opacity-100" /> : <ChevronRight className="h-4 w-4 text-teal-600 opacity-0 transition group-hover:opacity-100" />}</div></Link>;
        })}</div>}
      </section>
    </div>
    {composeOpen && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/25 p-0 backdrop-blur-sm sm:items-center sm:p-4"><form onSubmit={(event: FormEvent) => { event.preventDefault(); setSubmitError(''); create.mutate(true); }} className="max-h-[95vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><h2 className="font-bold text-slate-900">{ar ? 'رسالة جديدة' : 'New message'}</h2><button type="button" onClick={() => setComposeOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-teal-50 hover:text-teal-700"><X className="h-5 w-5" /></button></div><div className="space-y-3 p-5">
      <label><span className="mb-1 block text-xs font-semibold text-slate-600">{ar ? 'إلى' : 'To'}</span><select value={form.assigned_to} onChange={event => setForm({ ...form, assigned_to: event.target.value })} className={fieldClass}><option value="">{ar ? 'اختر المستلم...' : 'Choose recipient...'}</option>{recipients.map(recipient => <option key={recipient.id} value={recipient.id}>{recipient.name} — {recipient.email}</option>)}</select></label>
      <label><span className="mb-1 block text-xs font-semibold text-slate-600">{ar ? 'الموضوع' : 'Subject'}</span><input required value={form.subject} onChange={event => setForm({ ...form, subject: event.target.value })} className={fieldClass} /></label><textarea required rows={8} value={form.summary} onChange={event => setForm({ ...form, summary: event.target.value })} className={fieldClass} placeholder={ar ? 'اكتب رسالتك هنا...' : 'Write your message...'} />
      <div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1 block text-xs font-semibold text-slate-600">{ar ? 'الأولوية' : 'Priority'}</span><select value={form.priority} onChange={event => setForm({ ...form, priority: event.target.value })} className={fieldClass}><option value="normal">{ar ? 'عادية' : 'Normal'}</option><option value="urgent">{ar ? 'عاجلة' : 'Urgent'}</option><option value="critical">{ar ? 'عاجلة جداً' : 'Critical'}</option></select></label><label><span className="mb-1 block text-xs font-semibold text-slate-600">{ar ? 'موعد الرد (اختياري)' : 'Reply due (optional)'}</span><input type="date" value={form.response_due_date} onChange={event => setForm({ ...form, response_due_date: event.target.value })} className={fieldClass} /></label></div>
      <input ref={fileInput} type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" onChange={event => setAttachment(event.target.files?.[0] || null)} /><button type="button" onClick={() => fileInput.current?.click()} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50"><Paperclip className="h-4 w-4" />{attachment?.name || (ar ? 'إضافة مرفق' : 'Add attachment')}</button>{submitError && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{submitError}</p>}
    </div><div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 py-4"><Button type="button" variant="ghost" disabled={!form.subject.trim() || create.isPending} onClick={() => create.mutate(false)}>{ar ? 'حفظ كمسودة' : 'Save draft'}</Button><Button type="submit" disabled={!form.assigned_to || !form.subject.trim()} isLoading={create.isPending}><Send className="me-2 h-4 w-4" />{ar ? 'إرسال' : 'Send'}</Button></div></form></div>}
  </div>;
}
