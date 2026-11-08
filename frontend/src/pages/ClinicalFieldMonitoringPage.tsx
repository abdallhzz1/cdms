import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowDownToLine, CheckCircle2, ClipboardCheck, Clock3, Eye, FilePlus2, Inbox, Search, Send, Undo2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch, apiFetchEnvelope, apiUrl, ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { ClinicalFieldMonitoringForm } from '@/features/fieldMonitoring/ClinicalFieldMonitoringForm';
import { emptyDraft, FORM_TITLES, STATUS_LABELS } from '@/features/fieldMonitoring/definitions';
import type { FieldFormDraft, FieldFormRecord, FieldFormType, FieldMonitoringOptions } from '@/features/fieldMonitoring/types';

type Mailbox = 'all' | 'outgoing' | 'incoming';

export function ClinicalFieldMonitoringPage() {
  const { locale } = useI18n();
  const { user, can } = useAuth();
  const ar = locale === 'ar';
  const tr = (a: string, e: string) => ar ? a : e;
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [mailbox, setMailbox] = useState<Mailbox>('all');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<FieldFormRecord | null>(null);
  const [editing, setEditing] = useState<{ record?: FieldFormRecord; draft: FieldFormDraft } | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const optionsQuery = useQuery({ queryKey: ['clinical-field-monitoring-options'], queryFn: () => apiFetch<FieldMonitoringOptions>('/clinical-field-monitoring/options') });
  const listQuery = useQuery({
    queryKey: ['clinical-field-monitoring', mailbox, status, type, search],
    queryFn: () => apiFetchEnvelope<FieldFormRecord[]>(`/clinical-field-monitoring?mailbox=${mailbox}&status=${encodeURIComponent(status)}&type=${encodeURIComponent(type)}&search=${encodeURIComponent(search)}`),
  });
  const detailQuery = useMutation({ mutationFn: (id: number) => apiFetch<FieldFormRecord>(`/clinical-field-monitoring/forms/${id}`), onSuccess: record => { setSelected(record); setReviewNote(record.latest_review_note || ''); setError(''); } });

  useEffect(() => {
    const id = Number(params.get('form'));
    if (id > 0 && !selected && !detailQuery.isPending) detailQuery.mutate(id);
  }, [params]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['clinical-field-monitoring'] });
    if (selected) detailQuery.mutate(selected.id);
  };
  const saveMutation = useMutation({
    mutationFn: async ({ draft, record, submit }: { draft: FieldFormDraft; record?: FieldFormRecord; submit: boolean }) => {
      const body = normalizeDraft(draft);
      const saved = record
        ? await apiFetch<FieldFormRecord>(`/clinical-field-monitoring/forms/${record.id}`, { method: 'PUT', body })
        : await apiFetch<FieldFormRecord>('/clinical-field-monitoring/forms', { method: 'POST', body });
      return submit ? apiFetch<FieldFormRecord>(`/clinical-field-monitoring/forms/${saved.id}/submit`, { method: 'POST' }) : saved;
    },
    onSuccess: async saved => { setEditing(null); setSelected(saved); setNotice(saved.status === 'submitted' ? tr('تم إرسال النموذج للمراجعة.', 'The form was submitted for review.') : tr('تم حفظ المسودة.', 'Draft saved.')); setError(''); await refresh(); },
    onError: value => setError(apiMessage(value, tr('تعذر حفظ النموذج. تحقق من الحقول المطلوبة.', 'Unable to save the form. Check required fields.'))),
  });
  const submitMutation = useMutation({
    mutationFn: (id: number) => apiFetch<FieldFormRecord>(`/clinical-field-monitoring/forms/${id}/submit`, { method: 'POST' }),
    onSuccess: async saved => { setSelected(saved); setNotice(tr('تم إرسال النموذج.', 'Form submitted.')); setError(''); await refresh(); },
    onError: value => setError(apiMessage(value, tr('تعذر إرسال النموذج.', 'Unable to submit the form.'))),
  });
  const reviewMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: string }) => apiFetch<FieldFormRecord>(`/clinical-field-monitoring/forms/${id}/review`, { method: 'POST', body: { action, note: reviewNote || null } }),
    onSuccess: async saved => { setSelected(saved); setNotice(tr('تم حفظ قرار المراجعة.', 'Review decision saved.')); setError(''); await refresh(); },
    onError: value => setError(apiMessage(value, tr('تعذر حفظ قرار المراجعة.', 'Unable to save the review decision.'))),
  });

  const rows = listQuery.data?.data ?? [];
  const counts = useMemo(() => ({ urgent: rows.filter(row => row.is_urgent && row.status !== 'completed').length, incoming: rows.filter(row => row.recipient.id === user?.id && !['completed'].includes(row.status)).length, drafts: rows.filter(row => row.creator.id === user?.id && ['draft','returned_for_revision','action_required'].includes(row.status)).length }), [rows, user?.id]);

  if (optionsQuery.isLoading || listQuery.isLoading) return <LoadingState message={tr('تحميل نماذج المتابعة الميدانية...', 'Loading field monitoring forms...')} />;
  if (optionsQuery.isError || listQuery.isError || !optionsQuery.data) return <ErrorState title={tr('تعذر تحميل شاشة المتابعة', 'Could not load field monitoring')} onRetry={() => { optionsQuery.refetch(); listQuery.refetch(); }} />;
  const options = optionsQuery.data;

  const openDetail = (record: FieldFormRecord) => { setParams({ form: String(record.id) }); detailQuery.mutate(record.id); };
  const closeDetail = () => { setSelected(null); setParams({}); setError(''); setNotice(''); };
  const openNew = (formType?: FieldFormType) => {
    const selectedType = formType || options.allowed_types[0];
    if (!selectedType) return;
    setEditing({ draft: emptyDraft(selectedType, locale, options.creator.name) }); setSelected(null); setError(''); setNotice('');
  };
  const openEdit = (record: FieldFormRecord) => {
    if (!record.payload) return;
    setEditing({ record, draft: { type: record.type, locale, department_id: record.department?.id || '', training_site_id: record.training_site?.id || '', course_id: record.course?.id || '', activity_date: record.activity_date || '', period_from: record.period_from || '', period_to: record.period_to || '', payload: structuredClone(record.payload) } });
    setSelected(null); setError('');
  };

  return <div className="space-y-5">
    <PageHeader title={tr('المتابعة والزيارات الميدانية', 'Field Monitoring and Supervisory Visits')} description={tr('أنشئ نماذجك وتابع الوارد إليك ضمن مسار موثق من الإعداد حتى الإغلاق.', 'Create your forms and process incoming records through a documented workflow.')}>
      {options.allowed_types.length === 1 && <Button onClick={() => openNew()}><FilePlus2 className="me-1.5 h-4 w-4" />{tr('نموذج جديد', 'New form')}</Button>}
      {options.allowed_types.length > 1 && <div className="flex flex-wrap gap-2">{options.allowed_types.map(item => <Button key={item} size="sm" onClick={() => openNew(item)}><FilePlus2 className="me-1 h-4 w-4" />{ar ? FORM_TITLES[item].ar : FORM_TITLES[item].en}</Button>)}</div>}
    </PageHeader>

    {notice && <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800"><CheckCircle2 className="h-4 w-4" />{notice}</div>}
    <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><Summary icon={Inbox} label={tr('وارد يحتاج متابعة', 'Incoming pending')} value={counts.incoming} /><Summary icon={ClipboardCheck} label={tr('مسوداتي وإجراءاتي', 'My drafts and actions')} value={counts.drafts} /><Summary icon={AlertTriangle} label={tr('حالات عاجلة مفتوحة', 'Open urgent matters')} value={counts.urgent} danger={counts.urgent > 0} /></div>

    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid grid-cols-3 rounded-xl bg-slate-100 p-1 text-[11px] font-black sm:w-fit">
          {([['all',tr('الكل','All')],['outgoing',tr('نماذجي والصادر','My forms')],['incoming',tr('الوارد إليّ','Incoming')]] as [Mailbox,string][]).map(([value,label]) => <button key={value} onClick={() => setMailbox(value)} className={`rounded-lg px-3 py-2 transition ${mailbox === value ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-500'}`}>{label}</button>)}
        </div>
        <div className="grid gap-2 sm:grid-cols-3 lg:flex">
          <label className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 sm:col-span-3 lg:w-64"><Search className="h-4 w-4 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} className="w-full bg-transparent text-xs font-bold outline-none" placeholder={tr('بحث بالرقم أو الاسم...', 'Search reference or name...')} /></label>
          <select value={type} onChange={event => setType(event.target.value)} className="h-9 rounded-xl border border-slate-200 px-3 text-xs font-bold"><option value="">{tr('كل النماذج','All forms')}</option>{Object.entries(FORM_TITLES).map(([key,value]) => <option key={key} value={key}>{ar ? value.ar : value.en}</option>)}</select>
          <select value={status} onChange={event => setStatus(event.target.value)} className="h-9 rounded-xl border border-slate-200 px-3 text-xs font-bold"><option value="">{tr('كل الحالات','All statuses')}</option>{Object.entries(STATUS_LABELS).map(([key,value]) => <option key={key} value={key}>{ar ? value.ar : value.en}</option>)}</select>
        </div>
      </div>
      {rows.length === 0 ? <div className="p-10"><EmptyState title={tr('لا توجد نماذج', 'No forms found')} message={tr('أنشئ نموذجًا جديدًا أو غيّر عوامل التصفية.', 'Create a new form or change the filters.')} /></div> : <div className="divide-y divide-slate-100">{rows.map(record => <FormRow key={record.id} record={record} locale={locale} currentUserId={user?.id || 0} onOpen={() => openDetail(record)} />)}</div>}
    </section>

    <Modal isOpen={Boolean(editing)} onClose={() => !saveMutation.isPending && setEditing(null)} title={editing ? (ar ? FORM_TITLES[editing.draft.type].ar : FORM_TITLES[editing.draft.type].en) : ''} maxWidth="2xl" footer={editing && <><Button variant="ghost" disabled={saveMutation.isPending} onClick={() => setEditing(null)}>{tr('إلغاء','Cancel')}</Button><Button variant="outline" isLoading={saveMutation.isPending} onClick={() => saveMutation.mutate({ ...editing, submit: false })}>{tr('حفظ كمسودة','Save draft')}</Button><Button isLoading={saveMutation.isPending} onClick={() => saveMutation.mutate({ ...editing, submit: true })}><Send className="me-1 h-4 w-4" />{tr('حفظ وإرسال','Save and submit')}</Button></>}>
      {editing && <><div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-[11px]"><span className="font-bold text-slate-600">{tr('لغة النموذج الحالية','Current form language')}: <strong className="text-slate-900">{ar ? 'العربية' : 'English'}</strong></span><span className="font-bold text-slate-500">{tr('يمكن تنزيل النسخة لاحقًا بأي لغة.','The record can later be exported in either language.')}</span></div>{error && <FormError text={error} />}<ClinicalFieldMonitoringForm draft={editing.draft} options={options} locale={locale} onChange={draft => setEditing({ ...editing, draft })} /></>}
    </Modal>

    <Modal isOpen={Boolean(selected)} onClose={closeDetail} title={selected ? `${selected.reference_number} · ${ar ? FORM_TITLES[selected.type].ar : FORM_TITLES[selected.type].en}` : ''} maxWidth="2xl" footer={selected && <DetailFooter record={selected} currentUserId={user?.id || 0} canReview={can('clinical_field_monitoring.review') || can('clinical_field_monitoring.manage')} busy={submitMutation.isPending || reviewMutation.isPending} locale={locale} onEdit={() => openEdit(selected)} onSubmit={() => submitMutation.mutate(selected.id)} onReview={action => reviewMutation.mutate({ id: selected.id, action })} />}>
      {detailQuery.isPending ? <LoadingState /> : selected && <div className="space-y-5">{error && <FormError text={error} />}<DetailHeader record={selected} locale={locale} /><div className="flex flex-wrap gap-2"><a href={apiUrl(`/clinical-field-monitoring/forms/${selected.id}/pdf?locale=ar`)} className="inline-flex h-9 items-center rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"><ArrowDownToLine className="me-1 h-4 w-4" />PDF عربي</a><a href={apiUrl(`/clinical-field-monitoring/forms/${selected.id}/pdf?locale=en`)} className="inline-flex h-9 items-center rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"><ArrowDownToLine className="me-1 h-4 w-4" />English PDF</a></div>{selected.latest_review_note && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-6 text-amber-900"><strong>{tr('ملاحظة المراجع:','Reviewer note:')}</strong> {selected.latest_review_note}</div>}<ClinicalFieldMonitoringForm draft={{ type:selected.type, locale, department_id:selected.department?.id||'', training_site_id:selected.training_site?.id||'', course_id:selected.course?.id||'', activity_date:selected.activity_date||'', period_from:selected.period_from||'', period_to:selected.period_to||'', payload:selected.payload||{} }} options={options} locale={locale} disabled onChange={() => undefined} />{selected.recipient.id === user?.id && can('clinical_field_monitoring.review') && ['submitted','acknowledged'].includes(selected.status) && <label className="block text-xs font-black text-slate-700">{tr('ملاحظة المراجعة','Review note')}<textarea value={reviewNote} onChange={event => setReviewNote(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-slate-200 p-3 text-xs font-medium outline-none focus:border-teal-500" placeholder={tr('الملاحظة إلزامية عند الإعادة أو طلب إجراء.','A note is required when returning or requesting action.')} /></label>}<AuditTrail record={selected} locale={locale} /></div>}
    </Modal>
  </div>;
}

function FormRow({ record, locale, currentUserId, onOpen }: { record: FieldFormRecord; locale:'ar'|'en'; currentUserId:number; onOpen:()=>void }) {
  const ar = locale === 'ar'; const status = STATUS_LABELS[record.status]; const outgoing = record.creator.id === currentUserId;
  return <button type="button" onClick={onOpen} className="grid w-full gap-3 p-4 text-start transition hover:bg-teal-50/30 sm:grid-cols-[minmax(12rem,1.4fr)_minmax(9rem,.8fr)_minmax(9rem,.8fr)_auto] sm:items-center">
    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[10px] font-black text-teal-700">{record.reference_number}</span>{record.is_urgent && record.status !== 'completed' && <span className="rounded-full bg-rose-100 px-2 py-1 text-[9px] font-black text-rose-700">{ar?'عاجل':'Urgent'}</span>}</div><p className="mt-1 truncate text-sm font-black text-slate-900">{ar?FORM_TITLES[record.type].ar:FORM_TITLES[record.type].en}</p><p className="mt-1 text-[10px] font-bold text-slate-400">{outgoing ? `${ar?'إلى':'To'}: ${record.recipient.name}` : `${ar?'من':'From'}: ${record.creator.name}`}</p></div>
    <div className="text-[11px] font-bold text-slate-600">{record.training_site ? (ar?record.training_site.name_ar:record.training_site.name_en||record.training_site.name_ar) : record.department ? (ar?record.department.name_ar:record.department.name_en||record.department.name_ar) : '—'}</div>
    <div><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black ${status.tone}`}>{ar?status.ar:status.en}</span><p className="mt-1 text-[9px] text-slate-400">{new Intl.DateTimeFormat(ar?'ar-PS':'en-GB',{dateStyle:'medium'}).format(new Date(record.updated_at))}</p></div>
    <Eye className="h-4 w-4 text-slate-400" />
  </button>;
}

function DetailHeader({ record, locale }: { record:FieldFormRecord; locale:'ar'|'en' }) { const ar=locale==='ar'; const status=STATUS_LABELS[record.status]; return <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4"><Meta label={ar?'الحالة':'Status'} value={ar?status.ar:status.en} /><Meta label={ar?'أعد بواسطة':'Prepared by'} value={record.creator.name} /><Meta label={ar?'مرفوع إلى':'Submitted to'} value={record.recipient.name} /><Meta label={ar?'الإصدار':'Revision'} value={String(record.revision)} /></div>; }
function Meta({label,value}:{label:string;value:string}) { return <div><p className="text-[10px] font-bold text-slate-400">{label}</p><p className="mt-1 text-xs font-black text-slate-800">{value}</p></div>; }
function Summary({icon:Icon,label,value,danger}:{icon:any;label:string;value:number;danger?:boolean}) { return <div className="flex min-w-0 items-center gap-2 border-e border-slate-100 p-3 sm:p-4"><span className={`hidden rounded-xl p-2 sm:block ${danger?'bg-rose-50 text-rose-600':'bg-teal-50 text-teal-700'}`}><Icon className="h-4 w-4" /></span><div><p className="text-lg font-black text-slate-900">{value}</p><p className="truncate text-[9px] font-bold text-slate-500 sm:text-[11px]">{label}</p></div></div>; }
function FormError({text}:{text:string}) { return <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold leading-5 text-rose-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{text}</div>; }

function DetailFooter({ record, currentUserId, canReview, busy, locale, onEdit, onSubmit, onReview }: { record:FieldFormRecord; currentUserId:number; canReview:boolean; busy:boolean; locale:'ar'|'en'; onEdit:()=>void; onSubmit:()=>void; onReview:(action:string)=>void }) {
  const ar=locale==='ar'; const editable=record.creator.id===currentUserId&&['draft','returned_for_revision','action_required'].includes(record.status); const reviewing=record.recipient.id===currentUserId&&canReview&&['submitted','acknowledged'].includes(record.status);
  return <div className="flex w-full flex-wrap justify-end gap-2">{editable&&<><Button variant="outline" disabled={busy} onClick={onEdit}>{ar?'تعديل النموذج':'Edit form'}</Button><Button disabled={busy} onClick={onSubmit}><Send className="me-1 h-4 w-4" />{ar?'إرسال للمراجعة':'Submit for review'}</Button></>}{reviewing&&<><Button variant="outline" disabled={busy} onClick={()=>onReview('return')}><Undo2 className="me-1 h-4 w-4" />{ar?'إعادة للتعديل':'Return'}</Button><Button variant="outline" disabled={busy} onClick={()=>onReview('action_required')}><AlertTriangle className="me-1 h-4 w-4" />{ar?'طلب إجراء':'Request action'}</Button>{record.status==='submitted'&&<Button variant="secondary" disabled={busy} onClick={()=>onReview('acknowledge')}><Eye className="me-1 h-4 w-4" />{ar?'تأكيد الاطلاع':'Acknowledge'}</Button>}<Button disabled={busy} onClick={()=>onReview('complete')}><CheckCircle2 className="me-1 h-4 w-4" />{ar?'إكمال وإغلاق':'Complete'}</Button></>}</div>;
}

function AuditTrail({record,locale}:{record:FieldFormRecord;locale:'ar'|'en'}) { const ar=locale==='ar'; if(!record.events?.length)return null; return <section className="rounded-2xl border border-slate-200 bg-white p-4"><h3 className="mb-3 flex items-center gap-2 text-xs font-black text-slate-800"><Clock3 className="h-4 w-4 text-teal-600" />{ar?'سجل الإجراءات':'Audit trail'}</h3><div className="space-y-3">{record.events.map(event=><div key={event.id} className="flex gap-3 border-s border-slate-200 ps-3 text-[11px]"><div className="flex-1"><p className="font-black text-slate-700">{event.user?.name||'—'} · {event.action}</p>{event.note&&<p className="mt-1 text-slate-600">{event.note}</p>}</div><time className="text-[9px] text-slate-400">{new Intl.DateTimeFormat(ar?'ar-PS':'en-GB',{dateStyle:'short',timeStyle:'short'}).format(new Date(event.created_at))}</time></div>)}</div></section>; }

function normalizeDraft(draft:FieldFormDraft) { return { ...draft, department_id:draft.department_id||null, training_site_id:draft.training_site_id||null, course_id:draft.course_id||null, activity_date:draft.activity_date||null, period_from:draft.period_from||null, period_to:draft.period_to||null }; }
function apiMessage(error:unknown,fallback:string) { if(error instanceof ApiError){const first=Object.values(error.errors||{}).flat().find(value=>typeof value==='string');return typeof first==='string'?first:error.message||fallback}return fallback; }
