import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, ClipboardCheck, Pencil, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { ApiError, apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Modal } from '@/components/ui/Modal';
import { SupervisorStudentPhoto } from '@/components/clinical/SupervisorStudentPhoto';
import { formatDate, type AttendanceStatus } from './supervisorWorkspace';
import type { UniversityLecture } from './SupervisorUniversityAttendance';

type Group={id:number;name:string;academic_level:string|null;academic_year:{code:string;start_date:string;end_date:string;is_current:boolean}};
type Supervisor={id:number;full_name_ar:string;full_name_en?:string|null};
type Plan=UniversityLecture&{starts_on:string;ends_on:string;sessions_count:number;group:Group;supervisor:Supervisor};
type Session={id:number;clinical_university_lecture_id:number;session_date:string;records_count:number;lecture:{id:number;title:string;group:{id:number;name:string}};supervisor:Supervisor};
type Catalog={groups:Group[];supervisors:Supervisor[];lectures:Plan[];sessions:Session[]};
type Form={student_group_id:string;supervisor_person_id:string;title:string;starts_at:string;ends_at:string;date:string};
type ReviewRow={student:{id:number;university_number:string;full_name_ar:string;full_name_en?:string|null;photo_url?:string|null};subgroup:{name:string}|null;status:AttendanceStatus|null;excuse_note:string|null;recorded_by:string|null};
type ReviewDay={session_id:number|null;rows:ReviewRow[]};
const blank:Form={student_group_id:'',supervisor_person_id:'',title:'',starts_at:'09:00',ends_at:'11:30',date:''};
const weekdays=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const dayFor=(date:string)=>weekdays[new Date(`${date}T12:00:00Z`).getUTCDay()];

function SupervisorPicker({supervisors,value,onChange,ar}:{supervisors:Supervisor[];value:string;onChange:(id:string)=>void;ar:boolean}){
  const label=ar?'المشرف السريري':'Clinical supervisor';
  const name=(person:Supervisor)=>ar?person.full_name_ar:person.full_name_en||person.full_name_ar;
  const [search,setSearch]=useState(()=>name(supervisors.find(person=>String(person.id)===value)??{id:0,full_name_ar:''}));
  const [open,setOpen]=useState(false);
  const [active,setActive]=useState(-1);
  const root=useRef<HTMLDivElement>(null);
  const matches=useMemo(()=>supervisors.filter(person=>{
    const query=search.trim().toLocaleLowerCase();
    return !query||[person.full_name_ar,person.full_name_en].some(text=>text?.toLocaleLowerCase().includes(query));
  }),[supervisors,search]);
  useEffect(()=>{
    const close=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node)){setOpen(false);const selected=supervisors.find(person=>String(person.id)===value);if(selected)setSearch(name(selected));}};
    document.addEventListener('pointerdown',close);
    return()=>document.removeEventListener('pointerdown',close);
  },[supervisors,value,ar]);
  const choose=(person:Supervisor)=>{onChange(String(person.id));setSearch(name(person));setOpen(false);};
  const handleKeys=(event:KeyboardEvent<HTMLInputElement>)=>{
    if(event.key==='Escape'){setOpen(false);const selected=supervisors.find(person=>String(person.id)===value);if(selected)setSearch(name(selected));return;}
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
        onKeyDown={handleKeys} placeholder={ar?'ابحث باسم المشرف':'Search supervisor name'} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 pe-9 text-sm font-normal outline-none focus:border-teal-500"/>
    </div>
    {open&&<div id="university-supervisor-options" role="listbox" aria-label={label} className="absolute inset-x-0 z-30 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
      {matches.length?matches.map((person,index)=><button key={person.id} type="button" role="option" aria-selected={String(person.id)===value} onMouseEnter={()=>setActive(index)} onClick={()=>choose(person)} className={`block w-full rounded-lg px-3 py-2 text-start text-sm font-medium ${index===active?'bg-teal-50 text-teal-900':'text-slate-700 hover:bg-slate-50'}`}>{name(person)}</button>):<p className="px-3 py-2 text-xs font-normal text-slate-500">{ar?'لا يوجد مشرف بهذا الاسم':'No matching supervisor'}</p>}
    </div>}
  </div>;
}

export function UniversityAttendanceAdminPage(){
  const {can,user}=useAuth();const {locale}=useI18n();const ar=locale==='ar';const tr=(a:string,e:string)=>ar?a:e;
  const manager=can('university_lectures.manage');
  const canDeleteWithAttendance=Boolean(can('university_lectures.delete_with_attendance')&&(user?.roles??[]).includes('ADMIN_ASSISTANT'));
  const cache=useQueryClient();
  const [groupId,setGroupId]=useState('');const [editing,setEditing]=useState<number|null>(null);const [form,setForm]=useState<Form>(blank);const [pickerVersion,setPickerVersion]=useState(0);const [notice,setNotice]=useState('');const [selectedSession,setSelectedSession]=useState<Session|null>(null);const [ascending,setAscending]=useState(true);
  const [deleteTarget,setDeleteTarget]=useState<Plan|null>(null);const [deleteReason,setDeleteReason]=useState('');const [deleteConfirmation,setDeleteConfirmation]=useState('');
  const catalog=useQuery({queryKey:['university-attendance-plans',groupId],queryFn:()=>apiFetch<Catalog>(`/operational/university-attendance/plans${groupId?`?student_group_id=${groupId}`:''}`),enabled:manager});
  const groups=catalog.data?.groups??[];
  useEffect(()=>{if(!groupId&&groups.length){const group=groups.find(item=>item.academic_year.is_current)??groups[0];setGroupId(String(group.id));}},[groups,groupId]);
  const group=groups.find(item=>String(item.id)===groupId);
  useEffect(()=>{if(!editing&&group)setForm(current=>({...current,student_group_id:groupId}));},[groupId,editing,group]);
  const plans=useMemo(()=>(catalog.data?.lectures??[]).filter(item=>String(item.student_group_id)===groupId).sort((a,b)=>(ascending?1:-1)*(a.starts_on.localeCompare(b.starts_on)||a.starts_at.localeCompare(b.starts_at)||a.id-b.id)),[catalog.data,groupId,ascending]);
  const sessions=useMemo(()=>(catalog.data?.sessions??[]).filter(item=>String(item.lecture.group.id)===groupId),[catalog.data,groupId]);
  const review=useQuery({queryKey:['university-attendance-review',selectedSession?.id],queryFn:()=>apiFetch<ReviewDay>(`/operational/university-attendance/plans/${selectedSession!.clinical_university_lecture_id}/day?session_date=${encodeURIComponent(selectedSession!.session_date.slice(0,10))}`),enabled:manager&&Boolean(selectedSession)});
  const save=useMutation({mutationFn:()=>apiFetch(`/operational/university-attendance/plans${editing?`/${editing}`:''}`,{method:editing?'PUT':'POST',body:{student_group_id:Number(form.student_group_id),supervisor_person_id:Number(form.supervisor_person_id),title:form.title,starts_at:form.starts_at,ends_at:form.ends_at,starts_on:form.date,ends_on:form.date,weekday:dayFor(form.date)}}),onSuccess:async()=>{await cache.invalidateQueries({queryKey:['university-attendance-plans']});setEditing(null);setForm({...blank,student_group_id:groupId});setPickerVersion(version=>version+1);setNotice(tr('تم حفظ المحاضرة.','Lecture saved.'));}});
  const remove=useMutation({mutationFn:(id:number)=>apiFetch<{result:'deleted'|'archived'}>(`/operational/university-attendance/plans/${id}`,{method:'DELETE'}),onSuccess:async result=>{await cache.invalidateQueries({queryKey:['university-attendance-plans']});setNotice(result.result==='deleted'?tr('حُذفت المحاضرة.','Lecture deleted.'):tr('أُوقفت المحاضرة مع إبقاء كشفها محفوظًا.','Lecture archived; attendance retained.'));}});
  const permanentRemove=useMutation({
    mutationFn:()=>apiFetch<{result:'deleted_with_attendance';sessions_deleted:number;records_deleted:number}>(`/operational/university-attendance/plans/${deleteTarget!.id}/with-attendance`,{method:'DELETE',body:{reason:deleteReason.trim(),confirmation:deleteConfirmation}}),
    onSuccess:async result=>{setDeleteTarget(null);setDeleteReason('');setDeleteConfirmation('');setSelectedSession(null);setNotice(tr(`حُذفت المحاضرة مع ${result.sessions_deleted} كشف و${result.records_deleted} سجل حضور.`,`Lecture and ${result.sessions_deleted} registers (${result.records_deleted} attendance records) deleted.`));await Promise.all([cache.invalidateQueries({queryKey:['university-attendance-plans']}),cache.invalidateQueries({queryKey:['attendance-review-group']}),cache.invalidateQueries({queryKey:['attendance-warnings']})]);},
  });
  const error=save.error instanceof ApiError?Object.values(save.error.errors).flat().find(value=>typeof value==='string')??save.error.message:tr('تعذر حفظ الموعد.','Could not save schedule.');
  const startEdit=(item:Plan)=>{setEditing(item.id);setForm({student_group_id:String(item.student_group_id),supervisor_person_id:String(item.supervisor.id),title:item.title,starts_at:item.starts_at.slice(0,5),ends_at:item.ends_at.slice(0,5),date:item.starts_on.slice(0,10)});setNotice('');};
  const cancelEdit=()=>{setEditing(null);setForm({...blank,student_group_id:groupId});};
  const set=(key:keyof Form,value:string)=>setForm(current=>({...current,[key]:value}));

  if(!manager)return <ErrorState title={tr('ليس لديك صلاحية إعداد محاضرات الجامعة.','You do not have access to university lecture management.')}/>;
  if(catalog.isLoading)return <LoadingState/>;
  if(catalog.isError||!catalog.data)return <ErrorState onRetry={()=>catalog.refetch()}/>;
  return <div dir={ar?'rtl':'ltr'} className="mx-auto max-w-6xl space-y-4 pb-16">
    <header><Link to={can('attendance.review')?'/attendance':'/'} className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-800"><ArrowRight className="h-4 w-4"/>{can('attendance.review')?tr('سجل الحضور والغياب','Attendance register'):tr('العودة للرئيسية','Back to dashboard')}</Link><h1 className="mt-2 text-xl font-black text-slate-900">{tr('محاضرات الجامعة للمجموعات الرئيسية','Main-group university lectures')}</h1></header>
    <label className="block rounded-2xl border border-slate-200 bg-white p-4 text-xs font-bold text-slate-700 shadow-sm">{tr('المجموعة الرئيسية','Main group')}<select value={groupId} onChange={event=>{setGroupId(event.target.value);setEditing(null);setForm(blank);setSelectedSession(null);}} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="" disabled>{tr('اختر المجموعة','Choose group')}</option>{groups.map(item=><option key={item.id} value={item.id}>{item.name} · {item.academic_year.code} · {item.academic_level??''}</option>)}</select></label>
    {group&&<>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="mb-4 flex items-center justify-between"><h2 className="inline-flex items-center gap-2 text-sm font-black text-slate-900"><CalendarDays className="h-4 w-4 text-teal-700"/>{editing?tr('تعديل المحاضرة','Edit lecture'):tr('إضافة محاضرة','Add lecture')}</h2>{editing&&<button type="button" onClick={cancelEdit} className="inline-flex items-center gap-1 text-xs font-bold text-slate-600"><X className="h-4 w-4"/>{tr('إلغاء','Cancel')}</button>}</div>
        <form onSubmit={event=>{event.preventDefault();save.mutate();}} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-bold text-slate-700">{tr('التاريخ','Date')}<input required type="date" min={group.academic_year.start_date.slice(0,10)} max={group.academic_year.end_date.slice(0,10)} value={form.date} onChange={event=>set('date',event.target.value)} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"/></label>
          <SupervisorPicker key={`${editing??'new'}-${groupId}-${locale}-${pickerVersion}`} supervisors={catalog.data.supervisors} value={form.supervisor_person_id} onChange={value=>set('supervisor_person_id',value)} ar={ar}/>
          <label className="text-xs font-bold text-slate-700">{tr('من الساعة','From time')}<input required type="time" value={form.starts_at} onChange={event=>set('starts_at',event.target.value)} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"/></label>
          <label className="text-xs font-bold text-slate-700">{tr('إلى الساعة','Until time')}<input required type="time" value={form.ends_at} onChange={event=>set('ends_at',event.target.value)} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"/></label>
          <label className="text-xs font-bold text-slate-700 sm:col-span-2 lg:col-span-3">{tr('الموضوع','Topic')}<input required maxLength={160} value={form.title} onChange={event=>set('title',event.target.value)} placeholder={tr('موضوع المحاضرة','Lecture topic')} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"/></label>
          <div className="flex items-end"><button type="submit" disabled={save.isPending||!form.supervisor_person_id} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 text-xs font-black text-white disabled:opacity-50">{editing?<Save className="h-4 w-4"/>:<Plus className="h-4 w-4"/>}{editing?tr('حفظ التعديل','Save changes'):tr('إضافة المحاضرة','Add lecture')}</button></div>
        </form>{save.isError&&<p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-xs font-bold text-rose-700">{String(error)}</p>}{notice&&<p role="status" className="mt-3 text-xs font-bold text-teal-800">{notice}</p>}
      </section>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 p-4">
          <h2 className="text-sm font-black text-slate-900">{tr('جدول المحاضرات','Lecture timetable')} · {plans.filter(item=>item.is_active).length}</h2>
          <button type="button" onClick={()=>setAscending(value=>!value)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-700">{ascending?tr('الأقدم أولًا','Oldest first'):tr('الأحدث أولًا','Newest first')}</button>
        </div>
        {!plans.length?<p className="p-5 text-xs text-slate-500">{tr('لم تُضف محاضرات بعد.','No lectures added yet.')}</p>:<div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-xs"><thead className="bg-slate-50 text-slate-600"><tr>{[tr('رقم','No.'),tr('التاريخ واليوم','Date and day'),tr('المشرف','Instructor'),tr('الوقت','Time'),tr('الموضوع','Topic'),tr('إجراءات','Actions')].map(label=><th key={label} className="border-b border-slate-200 px-3 py-3 text-start">{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{plans.map((item,index)=><tr key={item.id} className={!item.is_active?'bg-slate-50 text-slate-400':''}>
              <td className="px-3 py-3">{index+1}</td>
              <td className="px-3 py-3 font-bold"><span dir="ltr">{formatDate(item.starts_on,ar)}</span><small className="block font-normal">{new Intl.DateTimeFormat(ar?'ar-PS':'en-GB',{weekday:'long'}).format(new Date(`${item.starts_on.slice(0,10)}T12:00:00`))}{item.starts_on!==item.ends_on?` · ${tr('متكررة حتى','Repeats until')} ${formatDate(item.ends_on,ar)}`:''}</small></td>
              <td className="px-3 py-3">{ar?item.supervisor.full_name_ar:item.supervisor.full_name_en||item.supervisor.full_name_ar}</td>
              <td dir="ltr" className="px-3 py-3">{item.starts_at.slice(0,5)}–{item.ends_at.slice(0,5)}</td>
              <td className="px-3 py-3 font-bold">{item.title}{!item.is_active&&<small className="block font-normal">{tr('موقوفة','Archived')}</small>}</td>
              <td className="px-3 py-3"><div className="flex flex-wrap gap-1">
                {item.is_active&&!item.sessions_count&&<button type="button" onClick={()=>startEdit(item)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 font-bold"><Pencil className="h-3.5 w-3.5"/>{tr('تعديل','Edit')}</button>}
                {item.is_active&&<button type="button" disabled={remove.isPending} onClick={()=>{if(window.confirm(item.sessions_count?tr('سيتم إيقاف المحاضرة مع إبقاء كشوف الحضور. هل تريد المتابعة؟','The lecture will be archived and attendance retained. Continue?'):tr('حذف هذه المحاضرة؟','Delete this lecture?')))remove.mutate(item.id);}} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 font-bold text-slate-700"><Trash2 className="h-3.5 w-3.5"/>{item.sessions_count?tr('إيقاف','Archive'):tr('حذف','Delete')}</button>}
                {canDeleteWithAttendance&&item.sessions_count>0&&<button type="button" onClick={()=>{setDeleteTarget(item);setDeleteReason('');setDeleteConfirmation('');permanentRemove.reset();}} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 font-bold text-rose-800"><Trash2 className="h-3.5 w-3.5"/>{tr('حذف نهائي مع الكشف','Permanently delete with registers')}</button>}
              </div></td>
            </tr>)}</tbody>
          </table>
        </div>}
        {remove.isError&&<p role="alert" className="p-3 text-xs text-rose-700">{remove.error instanceof Error?remove.error.message:tr('تعذر حذف المحاضرة.','Could not delete lecture.')}</p>}
      </section>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><h2 className="inline-flex items-center gap-2 border-b border-slate-100 p-4 text-sm font-black text-slate-900"><ClipboardCheck className="h-4 w-4 text-teal-700"/>{tr('كشوف المحاضرات المحفوظة','Saved lecture registers')}</h2>{!sessions.length?<p className="p-5 text-xs text-slate-500">{tr('لا توجد كشوف محفوظة بعد لهذه المجموعة.','No saved registers for this group yet.')}</p>:<div className="divide-y divide-slate-100">{sessions.map(item=><button type="button" key={item.id} onClick={()=>setSelectedSession(item)} className="flex w-full items-center justify-between gap-3 p-4 text-start hover:bg-slate-50"><span className="text-xs font-bold text-slate-900">{item.lecture.title} · {formatDate(item.session_date,ar)}<small className="mt-1 block font-normal text-slate-500">{item.supervisor?.full_name_ar}</small></span><span className="rounded-lg bg-teal-50 px-2 py-1 text-xs font-bold text-teal-800">{item.records_count} {tr('طلاب','students')}</span></button>)}</div>}</section>
      {selectedSession&&<section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 p-4"><h2 className="text-sm font-black text-slate-900">{selectedSession.lecture.title} · {formatDate(selectedSession.session_date,ar)}</h2><button type="button" onClick={()=>setSelectedSession(null)} aria-label={tr('إغلاق الكشف','Close register')}><X className="h-4 w-4"/></button></div>{review.isLoading?<LoadingState/>:review.isError?<div className="p-4"><ErrorState onRetry={()=>review.refetch()}/></div>:<div className="divide-y divide-slate-100">{review.data?.rows.map(row=><div key={row.student.id} className="flex items-center justify-between gap-3 p-3 sm:px-4"><div className="flex min-w-0 items-center gap-2"><SupervisorStudentPhoto student={row.student} ar={ar}/><span className="min-w-0"><b className="block truncate text-xs text-slate-900">{ar?row.student.full_name_ar:row.student.full_name_en||row.student.full_name_ar}</b><small className="text-[10px] text-slate-500">{row.student.university_number} · {row.subgroup?.name??'—'}</small></span></div><div className="text-end"><b className={`text-xs ${row.status==='absent'?'text-rose-700':'text-teal-800'}`}>{row.status==='present'?tr('حاضر','Present'):row.status==='absent'?tr('غائب','Absent'):row.status==='late'?tr('متأخر','Late'):row.status==='excused'?tr('بعذر','Excused'):'—'}</b>{row.excuse_note&&<small className="block max-w-52 text-[10px] text-slate-500">{row.excuse_note}</small>}</div></div>)}</div>}</section>}
    </>}
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
