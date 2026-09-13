import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Plus, Search, UserRound } from 'lucide-react';
import { apiFetch, ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';

type Meeting={id:number;minutes_number:string;meeting_type:string;status:string;meeting_date:string;meeting_time?:string|null;location?:string|null;chairperson?:string|null;action_items_count:number;open_actions_count:number};
const freshForm=()=>({meeting_type:'مجلس الدائرة السريرية',status:'scheduled',meeting_date:new Date().toISOString().slice(0,10),meeting_time:'',location:'',chairperson:'',agenda:''});
const field='h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100';
const statusTone:Record<string,string>={draft:'bg-slate-100 text-slate-600',scheduled:'bg-blue-50 text-blue-700',held:'bg-amber-50 text-amber-700',minutes_draft:'bg-violet-50 text-violet-700',approved:'bg-emerald-50 text-emerald-700',cancelled:'bg-rose-50 text-rose-700'};

export function MeetingsPage(){
  const {can}=useAuth();const {locale,t}=useI18n();const ar=locale==='ar';const qc=useQueryClient();
const [modal,setModal]=useState(false);const [search,setSearch]=useState('');const [status,setStatus]=useState('');const [form,setForm]=useState(freshForm);const [error,setError]=useState('');
const params=useMemo(()=>{const p=new URLSearchParams({per_page:'100'});if(search.trim())p.set('search',search.trim());if(status)p.set('status',status);return p.toString()},[search,status]);
const query=useQuery({queryKey:['meetings',params],queryFn:()=>apiFetch<Meeting[]>(`/meetings?${params}`)});
const create=useMutation({mutationFn:()=>apiFetch('/meetings',{method:'POST',body:{...form,meeting_time:form.meeting_time||null,location:form.location||null,chairperson:form.chairperson||null,agenda:form.agenda||null}}),onSuccess:async()=>{await qc.invalidateQueries({queryKey:['meetings']});setModal(false);setForm(freshForm());setError('')},onError:e=>setError(e instanceof ApiError?e.message:(ar?'تعذر إنشاء الاجتماع.':'Unable to create meeting.'))});
if(!can('meetings.manage'))return <ErrorState title={t('state.forbidden.title')} message={t('state.forbidden.message')}/>;if(query.isLoading)return <LoadingState/>;if(query.isError)return <ErrorState onRetry={()=>query.refetch()}/>;
const rows=query.data??[];const today=new Date().toISOString().slice(0,10);
const state=(v:string)=>({draft:ar?'مسودة':'Draft',scheduled:ar?'مجدول':'Scheduled',held:ar?'تم الانعقاد':'Held',minutes_draft:ar?'بانتظار الاعتماد':'Awaiting approval',approved:ar?'معتمد':'Approved',cancelled:ar?'ملغي':'Cancelled'}[v]||v);
const upcoming=rows.filter(x=>x.meeting_date>=today&&!['approved','cancelled'].includes(x.status)).length;const awaiting=rows.filter(x=>['held','minutes_draft'].includes(x.status)).length;const open=rows.reduce((sum,x)=>sum+(x.open_actions_count||0),0);
return <div className="mx-auto max-w-6xl space-y-4 pb-14">
  <PageHeader title={ar?'محاضر الاجتماعات':'Meeting minutes'} description={ar?'تخطيط الاجتماع، توثيق المحضر، ومتابعة ما ينتج عنه.':'Plan, document, and follow up meetings.'}><Button onClick={()=>setModal(true)}><Plus className="me-2 h-4 w-4"/>{ar?'اجتماع جديد':'New meeting'}</Button></PageHeader>

  <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="grid grid-cols-3 divide-x divide-x-reverse divide-slate-100 border-b border-slate-100">
      <Summary value={upcoming} label={ar?'قادمة':'Upcoming'} tone="text-blue-700"/>
      <Summary value={awaiting} label={ar?'تحتاج محضرًا':'Need minutes'} tone="text-violet-700"/>
      <Summary value={open} label={ar?'تكليفات مفتوحة':'Open tasks'} tone="text-amber-700"/>
    </div>
    <div className="grid gap-2 p-3 sm:grid-cols-[1fr_210px]">
      <label className="relative"><Search className="absolute right-3.5 top-3.5 h-4 w-4 text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} className={`${field} pr-10`} placeholder={ar?'ابحث عن اجتماع...':'Search meetings...'}/></label>
      <select value={status} onChange={e=>setStatus(e.target.value)} className={field}><option value="">{ar?'جميع الحالات':'All statuses'}</option>{['scheduled','held','minutes_draft','approved','draft','cancelled'].map(x=><option key={x} value={x}>{state(x)}</option>)}</select>
    </div>
  </section>

  {!rows.length?<EmptyState message={ar?'لا توجد اجتماعات مطابقة.':'No matching meetings.'}/>:<section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="hidden grid-cols-[minmax(220px,1.5fr)_180px_150px_150px_32px] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-[10px] font-black text-slate-500 md:grid"><span>{ar?'الاجتماع':'Meeting'}</span><span>{ar?'الموعد والمكان':'Date and location'}</span><span>{ar?'الحالة':'Status'}</span><span>{ar?'المتابعة':'Follow-up'}</span><span/></div><div className="divide-y divide-slate-100">{rows.map(m=><Link key={m.id} to={`/meetings/${m.id}`} className="group block px-4 py-4 transition hover:bg-slate-50 md:grid md:grid-cols-[minmax(220px,1.5fr)_180px_150px_150px_32px] md:items-center md:gap-4 md:px-5">
    <div className="flex items-start justify-between gap-3 md:block"><div className="min-w-0"><h2 className="truncate text-sm font-black text-slate-900">{m.meeting_type}</h2><p className="mt-1 font-mono text-[9px] font-bold text-slate-400">{m.minutes_number}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black md:hidden ${statusTone[m.status]||statusTone.draft}`}>{state(m.status)}</span></div>
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-bold text-slate-500 md:mt-0 md:block md:space-y-1"><span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-teal-600"/>{m.meeting_date.slice(0,10)}{m.meeting_time?` · ${m.meeting_time.slice(0,5)}`:''}</span><span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-slate-400"/>{m.location||'—'}</span></div>
    <div className="hidden md:block"><span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${statusTone[m.status]||statusTone.draft}`}>{state(m.status)}</span></div>
    <div className="mt-3 flex items-center justify-between text-[10px] font-bold md:mt-0 md:block"><span className={m.open_actions_count?'text-amber-700':'text-slate-400'}>{m.open_actions_count||0} {ar?'مفتوحة':'open'} · {m.action_items_count||0} {ar?'مخرج':'outputs'}</span>{m.chairperson&&<span className="flex items-center gap-1 text-slate-400 md:mt-1"><UserRound className="h-3 w-3"/>{m.chairperson}</span>}</div>
    <span className="hidden text-teal-600 md:block">{ar?<ChevronLeft className="h-4 w-4"/>:<ChevronRight className="h-4 w-4"/>}</span>
  </Link>)}</div></section>}

  <Modal isOpen={modal} onClose={()=>setModal(false)} title={ar?'اجتماع جديد':'New meeting'} maxWidth="2xl"><form onSubmit={(e:FormEvent)=>{e.preventDefault();create.mutate()}} className="space-y-4"><p className="rounded-xl bg-slate-50 p-3 text-[11px] font-bold leading-5 text-slate-600">{ar?'رقم المحضر ينشئه النظام تلقائيًا. يمكنك استكمال الحضور والنقاش والقرارات بعد انعقاد الاجتماع.':'The minutes number is generated automatically. Complete attendance and decisions after the meeting.'}</p><div className="grid gap-3 sm:grid-cols-2"><Field label={ar?'نوع الاجتماع':'Meeting type'}><select required value={form.meeting_type} onChange={e=>setForm({...form,meeting_type:e.target.value})} className={field}>{['مجلس الدائرة السريرية','اجتماع رؤساء الأقسام','لجنة الجودة والاعتماد','لجنة التدريب السريري','لجنة أكاديمية','اجتماع طارئ'].map(x=><option key={x}>{x}</option>)}</select></Field><Field label={ar?'الحالة':'Status'}><select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} className={field}><option value="scheduled">{ar?'مجدول':'Scheduled'}</option><option value="draft">{ar?'مسودة':'Draft'}</option></select></Field><Field label={ar?'التاريخ':'Date'}><input required type="date" value={form.meeting_date} onChange={e=>setForm({...form,meeting_date:e.target.value})} className={field}/></Field><Field label={ar?'الوقت':'Time'}><input type="time" value={form.meeting_time} onChange={e=>setForm({...form,meeting_time:e.target.value})} className={field}/></Field><Field label={ar?'المكان أو الرابط':'Location or link'}><input value={form.location} onChange={e=>setForm({...form,location:e.target.value})} className={field}/></Field><Field label={ar?'رئيس الجلسة':'Chairperson'}><input value={form.chairperson} onChange={e=>setForm({...form,chairperson:e.target.value})} className={field}/></Field></div><Field label={ar?'جدول الأعمال المبدئي':'Initial agenda'}><textarea rows={4} value={form.agenda} onChange={e=>setForm({...form,agenda:e.target.value})} className={`${field} h-auto py-3`} placeholder={ar?'كل بند في سطر مستقل':'One item per line'}/></Field>{error&&<p className="rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{error}</p>}<div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><Button type="button" variant="outline" onClick={()=>setModal(false)}>{ar?'إلغاء':'Cancel'}</Button><Button type="submit" isLoading={create.isPending}>{ar?'إنشاء الاجتماع':'Create'}</Button></div></form></Modal>
</div>}

function Summary({value,label,tone}:{value:number;label:string;tone:string}){return <div className="px-3 py-3 text-center sm:flex sm:items-baseline sm:justify-center sm:gap-2"><strong className={`text-lg font-black ${tone}`}>{value}</strong><span className="block text-[9px] font-bold text-slate-500 sm:inline sm:text-[10px]">{label}</span></div>}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label><span className="mb-1.5 block text-xs font-black text-slate-600">{label}</span>{children}</label>}
