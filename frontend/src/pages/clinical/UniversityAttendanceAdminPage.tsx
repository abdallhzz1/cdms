import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, ClipboardCheck, Pencil, Plus, Save, Search, Trash2, QrCode } from 'lucide-react';
import { ApiError, apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Modal } from '@/components/ui/Modal';
import { formatDate } from './supervisorWorkspace';
import { SupervisorUniversityAttendance, type UniversityLecture } from './SupervisorUniversityAttendance';

type Group={id:number;name:string;academic_level:string|null;academic_year:{code:string;start_date:string;end_date:string;is_current:boolean}};
type Supervisor={id:number|null;user_id?:number;full_name_ar:string;full_name_en?:string|null};
type Plan=UniversityLecture&{starts_on:string;ends_on:string;sessions_count:number;group:Group;supervisor:Supervisor};
type Session={id:number;clinical_university_lecture_id:number;session_date:string;records_count:number;lecture:{id:number;title:string;group:{id:number;name:string}};supervisor:Supervisor};
type Catalog={groups:Group[];supervisors:Supervisor[];lecturers?:Supervisor[];lectures:Plan[];sessions:Session[]};
type Form={student_group_id:string;supervisor_person_id:string;title:string;starts_at:string;ends_at:string;date:string};
const blank:Form={student_group_id:'',supervisor_person_id:'',title:'',starts_at:'09:00',ends_at:'11:30',date:''};
const weekdays=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const dayFor=(date:string)=>weekdays[new Date(`${date}T12:00:00Z`).getUTCDay()];

const lecturerKey=(person:Supervisor)=>person.user_id?`user:${person.user_id}`:String(person.id);

function SupervisorPicker({supervisors,value,onChange,ar}:{supervisors:Supervisor[];value:string;onChange:(id:string)=>void;ar:boolean}){
  const label=ar?'المحاضر':'Lecturer';
  const name=(person:Supervisor)=>ar?person.full_name_ar:person.full_name_en||person.full_name_ar;
  const [search,setSearch]=useState(()=>name(supervisors.find(person=>lecturerKey(person)===value)??{id:0,full_name_ar:''}));
  const [open,setOpen]=useState(false);
  const [active,setActive]=useState(-1);
  const root=useRef<HTMLDivElement>(null);
  const matches=useMemo(()=>supervisors.filter(person=>{
    const query=search.trim().toLocaleLowerCase();
    return !query||[person.full_name_ar,person.full_name_en].some(text=>text?.toLocaleLowerCase().includes(query));
  }),[supervisors,search]);
  useEffect(()=>{
    const close=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node)){setOpen(false);const selected=supervisors.find(person=>lecturerKey(person)===value);if(selected)setSearch(name(selected));}};
    document.addEventListener('pointerdown',close);
    return()=>document.removeEventListener('pointerdown',close);
  },[supervisors,value,ar]);
  const choose=(person:Supervisor)=>{onChange(lecturerKey(person));setSearch(name(person));setOpen(false);};
  const handleKeys=(event:KeyboardEvent<HTMLInputElement>)=>{
    if(event.key==='Escape'){setOpen(false);const selected=supervisors.find(person=>lecturerKey(person)===value);if(selected)setSearch(name(selected));return;}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();setOpen(true);
      setActive(index=>Math.max(0,Math.min(matches.length-1,index+(event.key==='ArrowDown'?1:-1))));
    }
    if(event.key==='Enter'&&open&&matches[active]){event.preventDefault();choose(matches[active]);}
  };
  return <div ref={root} className="relative text-xs font-bold text-slate-700">
    <label htmlFor="university-lecture-supervisor">{label}</label>
    <div className="relative mt-1.5"><Search className="pointer-events-none absolute end-3 top-3 h-4 w-4 text-slate-400"/>
      <input id="university-lecture-supervisor" role="combobox" aria-expanded={open} aria-controls="university-supervisor-options" aria-autocomplete="list" aria-required="true" autoComplete="off" value={search}
        onFocus={()=>{if(value)setSearch('');setOpen(true);setActive(-1);}}
        onChange={event=>{setSearch(event.target.value);onChange('');setOpen(true);setActive(-1);}}
        onKeyDown={handleKeys} placeholder={ar?'ابحث باسم المحاضر':'Search lecturer name'} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 pe-9 text-sm font-normal outline-none focus:border-teal-500"/>
    </div>
    {open&&<div id="university-supervisor-options" role="listbox" aria-label={label} className="absolute inset-x-0 z-30 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
      {matches.length?matches.map((person,index)=><button key={lecturerKey(person)} type="button" role="option" aria-selected={lecturerKey(person)===value} onMouseEnter={()=>setActive(index)} onClick={()=>choose(person)} className={`block w-full rounded-lg px-3 py-2 text-start text-sm font-medium ${index===active?'bg-teal-50 text-teal-900':'text-slate-700 hover:bg-slate-50'}`}>{name(person)}</button>):<p className="px-3 py-2 text-xs font-normal text-slate-500">{ar?'لا يوجد محاضر بهذا الاسم':'No matching lecturer'}</p>}
    </div>}
  </div>;
}

export function UniversityAttendanceAdminPage(){
  const {can,user}=useAuth();const {locale}=useI18n();const ar=locale==='ar';const tr=(a:string,e:string)=>ar?a:e;
  const manager=can('university_lectures.manage');
  const allowed=['university_lectures.manage','university_lectures.attendance.view','university_lectures.attendance.manage','attendance.record'].some(can);
  const [formOpen,setFormOpen]=useState(false);const [tab,setTab]=useState<'lectures'|'registers'>('lectures');const [search,setSearch]=useState('');
  const [opened,setOpened]=useState<{plan:Plan;date:string;mode:'manual'|'qr'}|null>(null);
  const canDeleteWithAttendance=Boolean(can('university_lectures.delete_with_attendance')&&(user?.roles??[]).includes('ADMIN_ASSISTANT'));
  const cache=useQueryClient();
  const [groupId,setGroupId]=useState('');const [editing,setEditing]=useState<number|null>(null);const [form,setForm]=useState<Form>(blank);const [pickerVersion,setPickerVersion]=useState(0);const [notice,setNotice]=useState('');const [ascending,setAscending]=useState(true);
  const [deleteTarget,setDeleteTarget]=useState<Plan|null>(null);const [deleteReason,setDeleteReason]=useState('');const [deleteConfirmation,setDeleteConfirmation]=useState('');
  const catalog=useQuery({queryKey:['university-attendance-plans',groupId],queryFn:()=>apiFetch<Catalog>(`/operational/university-attendance/plans${groupId?`?student_group_id=${groupId}`:''}`),enabled:allowed});
  const groups=catalog.data?.groups??[];
  useEffect(()=>{if(!groupId&&groups.length){const group=groups.find(item=>item.academic_year.is_current)??groups[0];setGroupId(String(group.id));}},[groups,groupId]);
  const group=groups.find(item=>String(item.id)===groupId);
  useEffect(()=>{if(!editing&&group)setForm(current=>({...current,student_group_id:groupId}));},[groupId,editing,group]);
  const plans=useMemo(()=>(catalog.data?.lectures??[]).filter(item=>String(item.student_group_id)===groupId&&`${item.title} ${item.supervisor.full_name_ar} ${item.supervisor.full_name_en??''} ${item.starts_on}`.toLowerCase().includes(search.trim().toLowerCase())).sort((a,b)=>(ascending?1:-1)*(a.starts_on.localeCompare(b.starts_on)||a.starts_at.localeCompare(b.starts_at)||a.id-b.id)),[catalog.data,groupId,ascending,search]);
  const sessions=useMemo(()=>(catalog.data?.sessions??[]).filter(item=>String(item.lecture.group.id)===groupId),[catalog.data,groupId]);
  const save=useMutation({mutationFn:()=>apiFetch(`/operational/university-attendance/plans${editing?`/${editing}`:''}`,{method:editing?'PUT':'POST',body:{student_group_id:Number(form.student_group_id),...(form.supervisor_person_id.startsWith('user:')?{lecturer_user_id:Number(form.supervisor_person_id.slice(5))}:{supervisor_person_id:Number(form.supervisor_person_id)}),title:form.title,starts_at:form.starts_at,ends_at:form.ends_at,starts_on:form.date,ends_on:form.date,weekday:dayFor(form.date)}}),onSuccess:async()=>{await cache.invalidateQueries({queryKey:['university-attendance-plans']});setFormOpen(false);setEditing(null);setForm({...blank,student_group_id:groupId});setPickerVersion(version=>version+1);setNotice(tr('تم حفظ المحاضرة.','Lecture saved.'));}});
  const remove=useMutation({mutationFn:(id:number)=>apiFetch<{result:'deleted'|'archived'}>(`/operational/university-attendance/plans/${id}`,{method:'DELETE'}),onSuccess:async result=>{await cache.invalidateQueries({queryKey:['university-attendance-plans']});setNotice(result.result==='deleted'?tr('حُذفت المحاضرة.','Lecture deleted.'):tr('أُوقفت المحاضرة مع إبقاء كشفها محفوظًا.','Lecture archived; attendance retained.'));}});
  const permanentRemove=useMutation({
    mutationFn:()=>apiFetch<{result:'deleted_with_attendance';sessions_deleted:number;records_deleted:number}>(`/operational/university-attendance/plans/${deleteTarget!.id}/with-attendance`,{method:'DELETE',body:{reason:deleteReason.trim(),confirmation:deleteConfirmation}}),
    onSuccess:async result=>{setDeleteTarget(null);setDeleteReason('');setDeleteConfirmation('');setOpened(null);setNotice(tr(`حُذفت المحاضرة مع ${result.sessions_deleted} كشف و${result.records_deleted} سجل حضور.`,`Lecture and ${result.sessions_deleted} registers (${result.records_deleted} attendance records) deleted.`));await Promise.all([cache.invalidateQueries({queryKey:['university-attendance-plans']}),cache.invalidateQueries({queryKey:['attendance-review-group']}),cache.invalidateQueries({queryKey:['attendance-warnings']})]);},
  });
  const error=save.error instanceof ApiError?Object.values(save.error.errors).flat().find(value=>typeof value==='string')??save.error.message:tr('تعذر حفظ الموعد.','Could not save schedule.');
  const startEdit=(item:Plan)=>{setFormOpen(true);setEditing(item.id);setForm({student_group_id:String(item.student_group_id),supervisor_person_id:lecturerKey(catalog.data?.lecturers?.find(person=>person.id===item.supervisor.id)??item.supervisor),title:item.title,starts_at:item.starts_at.slice(0,5),ends_at:item.ends_at.slice(0,5),date:item.starts_on.slice(0,10)});setNotice('');};
  const cancelEdit=()=>{setFormOpen(false);setEditing(null);setForm({...blank,student_group_id:groupId});};
  const set=(key:keyof Form,value:string)=>setForm(current=>({...current,[key]:value}));

  const canOperate=(plan:Plan)=>plan.is_active&&(plan.can_record_attendance??can('university_lectures.attendance.manage'));
  const lectureDates=(plan:Plan)=>plan.scheduled_dates?.length?plan.scheduled_dates:[plan.starts_on.slice(0,10)];
  const openedLecture=useMemo(()=>opened?{...opened.plan,scheduled_dates:opened.plan.scheduled_dates?.length?opened.plan.scheduled_dates:[opened.plan.starts_on.slice(0,10)]}:undefined,[opened?.plan]);
  const openPlan=(plan:Plan,mode:'manual'|'qr')=>{const dates=lectureDates(plan);const now=new Date();const date=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;setOpened({plan,date:dates.includes(date)?date:dates.filter(value=>value<=date).at(-1)??dates[0],mode});};

  if(!allowed)return <ErrorState title={tr('ليس لديك صلاحية إعداد محاضرات الجامعة.','You do not have access to university lecture management.')}/>;
  if(catalog.isLoading)return <LoadingState/>;
  if(catalog.isError||!catalog.data)return <ErrorState onRetry={()=>catalog.refetch()}/>;
  return <div dir={ar?'rtl':'ltr'} className="mx-auto max-w-6xl space-y-4 pb-16">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><Link to={can('attendance.review')?'/attendance':'/'} className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-800"><ArrowRight className="h-4 w-4"/>{can('attendance.review')?tr('سجل الحضور والغياب','Attendance register'):tr('العودة للرئيسية','Back to dashboard')}</Link><h1 className="mt-2 text-xl font-black text-slate-900">{tr('محاضرات الجامعة للمجموعات الرئيسية','Main-group university lectures')}</h1></div>{manager&&<button type="button" onClick={()=>{setEditing(null);setForm({...blank,student_group_id:groupId});save.reset();setFormOpen(true);}} disabled={!groupId} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-teal-700 px-4 text-xs font-bold text-white disabled:opacity-50"><Plus className="h-4 w-4"/>{tr('إضافة محاضرة','Add lecture')}</button>}</header>
    <label className="block rounded-2xl border border-slate-200 bg-white p-4 text-xs font-bold text-slate-700 shadow-sm">{tr('المجموعة الرئيسية','Main group')}<select value={groupId} onChange={event=>{setGroupId(event.target.value);setEditing(null);setForm(blank);setOpened(null);}} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="" disabled>{tr('اختر المجموعة','Choose group')}</option>{groups.map(item=><option key={item.id} value={item.id}>{item.name} · {item.academic_year.code} · {item.academic_level?(ar?({fourth:'السنة الرابعة',fifth:'السنة الخامسة',sixth:'السنة السادسة'} as Record<string,string>)[item.academic_level]??item.academic_level:item.academic_level):''}</option>)}</select></label>
    {group&&<>
      {notice&&<p role="status" className="rounded-xl bg-teal-50 p-3 text-xs font-bold text-teal-800">{notice}</p>}
      <div className="flex flex-wrap items-center gap-2"><div role="tablist" aria-label={tr('محاضرات الجامعة','University lectures')} className="inline-flex rounded-xl border border-slate-200 bg-white p-1">{(['lectures','registers'] as const).map(value=><button type="button" role="tab" aria-selected={tab===value} key={value} onClick={()=>setTab(value)} className={`min-h-10 rounded-lg px-4 text-xs font-bold ${tab===value?'bg-teal-700 text-white':'text-slate-600'}`}>{value==='lectures'?tr('المحاضرات','Lectures'):tr('الكشوف المحفوظة','Saved registers')}</button>)}</div>{tab==='lectures'&&<input aria-label={tr('البحث عن محاضرة','Search lectures')} value={search} onChange={event=>setSearch(event.target.value)} placeholder={tr('بحث بالموضوع أو المحاضر أو التاريخ','Search topic, lecturer or date')} className="h-11 min-w-0 basis-full rounded-xl border border-slate-200 bg-white px-3 text-sm sm:basis-48 sm:flex-1"/>}</div>
      {tab==='lectures'?<section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 p-4"><h2 className="text-sm font-bold">{tr('جدول المحاضرات','Lecture timetable')} · {plans.length}</h2><button type="button" onClick={()=>setAscending(value=>!value)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">{ascending?tr('الأقدم أولًا','Oldest first'):tr('الأحدث أولًا','Newest first')}</button></div>
        {!plans.length?<p className="p-6 text-sm text-slate-500">{tr('لا توجد محاضرات مطابقة.','No matching lectures.')}</p>:<div className="divide-y divide-slate-100">{plans.map(item=><article key={item.id} className="grid items-center gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0"><h3 className="text-sm font-bold text-slate-900">{item.title}{!item.is_active&&<span className="ms-2 text-xs font-normal text-slate-500">{tr('مؤرشفة','Archived')}</span>}</h3><p className="mt-1 text-xs leading-6 text-slate-600">{ar?item.supervisor.full_name_ar:item.supervisor.full_name_en||item.supervisor.full_name_ar}</p><p className="text-xs text-slate-500"><CalendarDays className="me-1 inline h-3.5 w-3.5"/>{formatDate(item.starts_on,ar)}{item.starts_on!==item.ends_on?` — ${formatDate(item.ends_on,ar)}`:''} · <span dir="ltr">{item.starts_at.slice(0,5)}–{item.ends_at.slice(0,5)}</span></p></div>
          <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={()=>openPlan(item,'manual')} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 text-xs font-bold text-teal-900"><ClipboardCheck className="h-4 w-4"/>{tr('كشف الحضور','Attendance register')}</button>{item.is_active&&canOperate(item)&&<button type="button" onClick={()=>openPlan(item,'qr')} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700"><QrCode className="h-4 w-4"/>{tr('رمز الحضور','Attendance QR')}</button>}
          {manager&&<details className="relative"><summary className="cursor-pointer rounded-lg p-2 text-xs text-slate-500">{tr('المزيد','More')}</summary><div className="absolute end-0 z-20 mt-1 grid min-w-48 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
            {item.is_active&&!item.sessions_count&&<button type="button" onClick={()=>startEdit(item)} className="flex items-center gap-2 rounded-lg px-2 py-2 text-start text-xs hover:bg-slate-50"><Pencil className="h-4 w-4"/>{tr('تعديل','Edit')}</button>}
            {item.is_active&&<button type="button" disabled={remove.isPending} onClick={()=>{if(window.confirm(item.sessions_count?tr('إيقاف المحاضرة وإبقاء كشوف الحضور؟','Archive lecture and retain registers?'):tr('حذف هذه المحاضرة؟','Delete this lecture?')))remove.mutate(item.id);}} className="flex items-center gap-2 rounded-lg px-2 py-2 text-start text-xs hover:bg-slate-50"><Trash2 className="h-4 w-4"/>{item.sessions_count?tr('إيقاف','Archive'):tr('حذف','Delete')}</button>}
            {canDeleteWithAttendance&&item.sessions_count>0&&<button type="button" onClick={()=>{setDeleteTarget(item);setDeleteReason('');setDeleteConfirmation('');permanentRemove.reset();}} className="rounded-lg px-2 py-2 text-start text-xs font-bold text-rose-800 hover:bg-rose-50">{tr('حذف نهائي مع الكشف','Permanently delete with registers')}</button>}
          </div></details>}</div>
        </article>)}</div>}{remove.isError&&<p role="alert" className="p-4 text-xs text-rose-700">{remove.error.message}</p>}
      </section>:<section className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">{!sessions.length?<p className="p-6 text-sm text-slate-500">{tr('لا توجد كشوف محفوظة.','No saved registers.')}</p>:sessions.map(item=><button key={item.id} type="button" onClick={()=>{const plan=catalog.data.lectures.find(plan=>plan.id===item.clinical_university_lecture_id);if(plan)setOpened({plan,date:item.session_date.slice(0,10),mode:'manual'});}} className="flex w-full items-center justify-between gap-3 p-4 text-start hover:bg-slate-50"><span className="text-sm font-bold">{item.lecture.title}<small className="mt-1 block text-xs font-normal text-slate-500">{formatDate(item.session_date,ar)} · {item.supervisor?.full_name_ar}</small></span><span className="shrink-0 rounded-lg bg-teal-50 px-3 py-2 text-xs font-bold text-teal-800">{item.records_count} {tr('طالب','students')}</span></button>)}</section>}
    </>}
    {group&&<Modal isOpen={formOpen&&manager} onClose={cancelEdit} title={editing?tr('تعديل المحاضرة','Edit lecture'):tr('إضافة محاضرة','Add lecture')} maxWidth="2xl">
        <form onSubmit={event=>{event.preventDefault();save.mutate();}} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-bold text-slate-700">{tr('التاريخ','Date')}<input required type="date" min={group.academic_year.start_date.slice(0,10)} max={group.academic_year.end_date.slice(0,10)} value={form.date} onChange={event=>set('date',event.target.value)} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"/></label>
          <SupervisorPicker key={`${editing??'new'}-${groupId}-${locale}-${pickerVersion}`} supervisors={catalog.data.lecturers??catalog.data.supervisors} value={form.supervisor_person_id} onChange={value=>set('supervisor_person_id',value)} ar={ar}/>
          <label className="text-xs font-bold text-slate-700">{tr('من الساعة','From time')}<input required type="time" value={form.starts_at} onChange={event=>set('starts_at',event.target.value)} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"/></label>
          <label className="text-xs font-bold text-slate-700">{tr('إلى الساعة','Until time')}<input required type="time" value={form.ends_at} onChange={event=>set('ends_at',event.target.value)} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"/></label>
          <label className="text-xs font-bold text-slate-700 sm:col-span-2 lg:col-span-3">{tr('الموضوع','Topic')}<input required maxLength={160} value={form.title} onChange={event=>set('title',event.target.value)} placeholder={tr('موضوع المحاضرة','Lecture topic')} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"/></label>
          <div className="flex items-end"><button type="submit" disabled={save.isPending||!form.supervisor_person_id} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 text-xs font-black text-white disabled:opacity-50">{editing?<Save className="h-4 w-4"/>:<Plus className="h-4 w-4"/>}{editing?tr('حفظ التعديل','Save changes'):tr('إضافة المحاضرة','Add lecture')}</button></div>
        </form>{save.isError&&<p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-xs font-bold text-rose-700">{String(error)}</p>}
    </Modal>}
    <Modal isOpen={Boolean(opened)} onClose={()=>{setOpened(null);void cache.invalidateQueries({queryKey:['university-attendance-plans']});}} title={tr('حضور محاضرة الجامعة','University lecture attendance')} maxWidth="2xl">
      {opened&&<><label className="mb-3 block text-xs font-bold text-slate-700">{tr('التاريخ','Date')}<select aria-label={tr('تاريخ الكشف','Register date')} value={opened.date} onChange={event=>setOpened({...opened,date:event.target.value})} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm">{lectureDates(opened.plan).map(date=><option key={date} value={date}>{formatDate(date,ar)}</option>)}</select></label><SupervisorUniversityAttendance key={`${opened.plan.id}-${opened.date}-${opened.mode}`} lecture={openedLecture!} sessionDate={opened.date} initialMode={opened.mode} canRecord={canOperate(opened.plan)}/></>}
    </Modal>
    <Modal isOpen={Boolean(deleteTarget)} onClose={()=>{if(!permanentRemove.isPending)setDeleteTarget(null);}} title={tr('حذف المحاضرة وكشوفها نهائيًا','Permanently delete lecture and registers')} maxWidth="lg">
      {deleteTarget&&<div className="space-y-4 text-sm">
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 font-bold leading-7 text-rose-900">
          {tr('هذا الإجراء لا يمكن التراجع عنه. سيحذف المحاضرة وكل كشوف حضورها وغيابها من تقارير الطلبة، وستُعاد حسابات الغياب. التنبيهات المرسلة سابقًا لا يمكن سحبها.', 'This cannot be undone. The lecture and all its registers will be removed from student attendance reports and absence totals recalculated. Previously sent alerts cannot be recalled.')}
        </div>
        <p className="font-bold text-slate-900">{deleteTarget.title} · {formatDate(deleteTarget.starts_on,ar)} · {deleteTarget.sessions_count} {tr('كشوف محفوظة','saved registers')}</p>
        <label className="block text-xs font-bold text-slate-700">{tr('سبب الحذف الإداري (10 أحرف على الأقل)','Administrative reason (at least 10 characters)')}
          <textarea value={deleteReason} onChange={event=>setDeleteReason(event.target.value)} maxLength={1000} rows={3} className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-rose-400"/>
        </label>
        <label className="block text-xs font-bold text-slate-700">{tr(`اكتب اسم المحاضرة للتأكيد: ${deleteTarget.title}`,`Type the lecture title to confirm: ${deleteTarget.title}`)}
          <input value={deleteConfirmation} onChange={event=>setDeleteConfirmation(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-rose-400"/>
        </label>
        {permanentRemove.isError&&<p role="alert" className="rounded-lg bg-rose-50 p-3 text-xs font-bold text-rose-700">{permanentRemove.error instanceof ApiError?permanentRemove.error.message:tr('تعذر الحذف. حاول مرة أخرى.','Could not delete. Please try again.')}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={permanentRemove.isPending||deleteReason.trim().length<10||deleteConfirmation!==deleteTarget.title} onClick={()=>permanentRemove.mutate()} className="min-h-11 rounded-xl bg-rose-700 px-5 text-xs font-black text-white disabled:opacity-50">{tr('حذف المحاضرة والكشوف نهائيًا','Delete lecture and registers permanently')}</button>
          <button type="button" disabled={permanentRemove.isPending} onClick={()=>setDeleteTarget(null)} className="min-h-11 rounded-xl border border-slate-200 px-5 text-xs font-bold text-slate-700">{tr('إلغاء','Cancel')}</button>
        </div>
      </div>}
    </Modal>
  </div>;
}
