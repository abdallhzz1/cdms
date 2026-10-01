import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, ClipboardCheck, QrCode, Save, StickyNote } from 'lucide-react';
import { ApiError, apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { SupervisorStudentPhoto } from '@/components/clinical/SupervisorStudentPhoto';
import { SupervisorStudentNotesButton } from '@/components/clinical/SupervisorStudentNotesButton';
import { formatDate, formatWeekday, groupSupervisorAssignments, studentName, today, workspaceQueryKey, type AttendanceStatus, type Workspace } from './supervisorWorkspace';

type ManualRecord={student_id:number;status:AttendanceStatus;excuse_note:string|null;recording_source:string|null;updated_at:string};
type ManualDay={records:ManualRecord[];qr_session:{id:number;state:string}|null};
type Draft={status:AttendanceStatus|'';note:string};
const statusOptions:{value:AttendanceStatus;ar:string;en:string;active:string}[]=[
  {value:'present',ar:'حاضر',en:'Present',active:'border-teal-300 bg-teal-50 text-teal-900'},
  {value:'absent',ar:'غائب',en:'Absent',active:'border-rose-300 bg-rose-50 text-rose-800'},
  {value:'late',ar:'متأخر',en:'Late',active:'border-amber-300 bg-amber-50 text-amber-900'},
  {value:'excused',ar:'بعذر',en:'Excused',active:'border-sky-300 bg-sky-50 text-sky-900'},
];

/** Official attendance notes are shared with authorized reviewers; private student notes are separate. */
export function SupervisorAttendancePage(){
  const {user,can}=useAuth();const {locale}=useI18n();const ar=locale==='ar';const tr=(a:string,e:string)=>ar?a:e;
  const [params]=useSearchParams();const client=useQueryClient();
  const isSupervisor=(user?.roles??[]).some(role=>String(role).toUpperCase()==='CLINICAL_SUPERVISOR');
  const workspace=useQuery({queryKey:workspaceQueryKey,queryFn:()=>apiFetch<Workspace>('/operational/my-supervisor-workspace'),enabled:isSupervisor&&can('supervisor.workspace.view')&&can('attendance.record')});
  const groups=useMemo(()=>groupSupervisorAssignments(workspace.data?.assignments??[]),[workspace.data?.assignments]);
  const dates=useMemo(()=>[...new Set(groups.flatMap(group=>group.scheduledDates))].sort(),[groups]);
  const [date,setDate]=useState('');const [groupKey,setGroupKey]=useState('');
  const [draft,setDraft]=useState<Record<number,Draft>>({});const [expandedNote,setExpandedNote]=useState<number|null>(null);
  const [notice,setNotice]=useState('');
  useEffect(()=>{setDate(current=>{const requested=params.get('date');return requested&&dates.includes(requested)?requested:dates.includes(current)?current:dates.filter(day=>day<=today()).at(-1)??dates[0]??'';});},[dates,params]);
  const scheduledGroups=useMemo(()=>groups.filter(group=>group.scheduledDates.includes(date)),[groups,date]);
  useEffect(()=>{setGroupKey(current=>{const requested=params.get('group');return scheduledGroups.find(group=>group.key===requested)?.key??scheduledGroups.find(group=>group.key===current)?.key??scheduledGroups[0]?.key??'';});},[scheduledGroups,params]);
  const group=scheduledGroups.find(item=>item.key===groupKey)??null;
  const day=useQuery({queryKey:['supervisor-manual-attendance',group?.assignmentId,date],queryFn:()=>apiFetch<ManualDay>(`/operational/my-supervisor-attendance?assignment_id=${group!.assignmentId}&session_date=${date}`),enabled:Boolean(group&&date)});
  useEffect(()=>{if(!day.data)return;const records=new Map(day.data.records.map(row=>[row.student_id,row]));setDraft(Object.fromEntries((group?.students??[]).map(student=>{const record=records.get(student.id);return [student.id,{status:record?.status??'',note:record?.excuse_note??''}];})));setExpandedNote(null);setNotice('');},[day.data,group?.key]);

  const rows=group?.students??[];
  const completed=rows.filter(student=>draft[student.id]?.status).length;
  const missing=rows.length-completed;
  const missingExcuses=rows.filter(student=>draft[student.id]?.status==='excused'&&!draft[student.id]?.note.trim()).length;
  const existing=new Map((day.data?.records??[]).map(row=>[row.student_id,row]));
  const changed=rows.some(student=>{const row=draft[student.id],saved=existing.get(student.id);return (row?.status??'')!==(saved?.status??'')||(row?.note.trim()??'')!==(saved?.excuse_note??'');});
  const isFuture=Boolean(date&&date>today());
  const save=useMutation({
    mutationFn:()=>apiFetch('/operational/my-supervisor-attendance',{method:'POST',body:{assignment_id:group!.assignmentId,session_date:date,records:rows.map(student=>({student_id:student.id,status:draft[student.id].status,excuse_note:draft[student.id].note.trim()||null}))}}),
    onSuccess:async()=>{await Promise.all([
      client.invalidateQueries({queryKey:['supervisor-manual-attendance',group?.assignmentId,date]}),
      client.invalidateQueries({queryKey:workspaceQueryKey}),
      client.invalidateQueries({queryKey:['attendance-group-summary']}),
    ]);setNotice(tr('تم حفظ حضور المجموعة وملاحظاتها في السجل الرسمي.','Group attendance and notes were saved to the official register.'));},
  });
  const setStatus=(id:number,status:AttendanceStatus)=>{setDraft(current=>({...current,[id]:{status,note:current[id]?.note??''}}));setNotice('');};
  const setNote=(id:number,note:string)=>{setDraft(current=>({...current,[id]:{status:current[id]?.status??'',note}}));setNotice('');};
  const markAllPresent=()=>{setDraft(current=>Object.fromEntries(rows.map(student=>[student.id,{status:'present',note:current[student.id]?.note??''}])));setNotice('');};
  const error=save.error instanceof ApiError?Object.values(save.error.errors).flat().find(value=>typeof value==='string')??save.error.message:tr('تعذر حفظ الحضور، حاول مرة أخرى.','Unable to save attendance. Please try again.');
  const canSave=Boolean(rows.length&&!missing&&!missingExcuses&&changed&&!isFuture&&!save.isPending);

  if(!isSupervisor)return <ErrorState title={tr('حضور المشرف السريري','Clinical supervisor attendance')}/>;
  if(!can('supervisor.workspace.view')||!can('attendance.record'))return <ErrorState title={tr('صلاحية الحضور غير مفعلة','Attendance permission is disabled')}/>;
  if(workspace.isLoading)return <LoadingState/>;
  if(workspace.isError||!workspace.data)return <ErrorState onRetry={()=>workspace.refetch()}/>;

  return <div dir={ar?'rtl':'ltr'} className="mx-auto w-full min-w-0 max-w-5xl space-y-3 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:space-y-4 sm:pb-16">
    <header className="space-y-1 sm:space-y-2">
      <Link to="/supervisor/portal" className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-800"><ArrowRight className="h-4 w-4"/>{tr('لوحة المشرف','Supervisor dashboard')}</Link>
      <div className="flex items-center justify-between gap-2 sm:items-end"><div className="min-w-0"><h1 className="text-lg font-black text-slate-900 sm:text-xl">{tr('الحضور والغياب','Attendance')}</h1><p className="mt-1 hidden text-xs leading-5 text-slate-500 sm:block">{tr('حدد حالة كل طالب، وأضف ملاحظة رسمية عند الحاجة، ثم احفظ المجموعة.','Select each student’s status, add an official note when needed, then save the group.')}</p></div><Link to={`/supervisor/attendance/qr?group=${encodeURIComponent(groupKey)}&date=${date}`} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-700 hover:border-teal-300 sm:min-h-10 sm:px-3 sm:text-xs"><QrCode className="h-4 w-4"/><span className="sm:hidden">QR</span><span className="hidden sm:inline">{tr('استخدام QR بدلًا من اليدوي','Use QR instead')}</span></Link></div>
    </header>
    {!dates.length?<div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-600">{tr('لا توجد أيام تدريب منشورة ضمن تكليفك.','No published training days are assigned to you.')}</div>:<>
      <section className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:gap-3 sm:p-4">
        <label className="min-w-0 text-[11px] font-bold text-slate-700 sm:text-xs">{tr('يوم التدريب','Training day')}<select value={date} onChange={event=>{setDate(event.target.value);setNotice('');}} className="mt-1 h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold sm:mt-1.5 sm:h-11 sm:px-3 sm:text-sm"><option value="" disabled>{tr('اختر اليوم','Choose a day')}</option>{dates.map(value=><option key={value} value={value}>{formatWeekday(value,ar)} · {formatDate(value,ar)}</option>)}</select></label>
        <label className="min-w-0 text-[11px] font-bold text-slate-700 sm:text-xs">{tr('المجموعة والمركز','Group and site')}<select value={groupKey} onChange={event=>{setGroupKey(event.target.value);setNotice('');}} className="mt-1 h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold sm:mt-1.5 sm:h-11 sm:px-3 sm:text-sm"><option value="" disabled>{tr('اختر المجموعة','Choose a group')}</option>{scheduledGroups.map(item=><option key={item.key} value={item.key}>{item.group} ({item.subgroup}) · {ar?item.siteAr:item.siteEn}</option>)}</select></label>
      </section>
      {group&&<section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-3 sm:px-5 sm:py-4"><div className="min-w-0"><h2 className="truncate text-sm font-black text-slate-900">{group.group} ({group.subgroup})</h2><p className="mt-0.5 truncate text-[10px] text-slate-500 sm:text-[11px]">{ar?group.courseAr:group.courseEn} · {ar?group.siteAr:group.siteEn}</p></div><span className="shrink-0 rounded-lg bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-700 sm:px-3 sm:py-1.5 sm:text-xs">{completed}/{rows.length}<span className="hidden sm:inline"> {tr('محددة الحالة','statuses selected')}</span></span></div>
        {day.isLoading?<LoadingState/>:day.isError?<div className="p-4"><ErrorState onRetry={()=>day.refetch()}/></div>:day.data?.qr_session?<div className="space-y-2 p-5 text-xs leading-6 text-slate-700"><b className="block text-amber-800">{tr('هذه المجموعة تستخدم جلسة QR لهذا اليوم.','This group has a QR session for this day.')}</b><p>{tr('لمنع تضارب النتائج، تُراجع هذه الجلسة من شاشة QR ولا تُستبدل يدويًا.','To avoid conflicting results, review this session on the QR screen rather than replacing it manually.')}</p><Link to={`/supervisor/attendance/qr?group=${encodeURIComponent(group.key)}&date=${date}`} className="inline-flex rounded-lg bg-teal-700 px-3 py-2 font-bold text-white">{tr('فتح جلسة QR','Open QR session')}</Link></div>:<>
          <div className="flex items-center justify-between gap-2 bg-slate-50/70 px-3 py-2 sm:px-5 sm:py-3"><p className="hidden text-[11px] text-slate-600 sm:block">{day.data?.records.length?tr('يمكن تعديل السجل المحفوظ؛ ستُوثق التغييرات.','You may revise saved records; changes are audited.'):tr('لا يُعتبر الطالب حاضرًا تلقائيًا قبل تحديد حالته وحفظ المجموعة.','Students are not marked present until you select statuses and save.')}</p><p className="text-[11px] font-medium text-slate-600 sm:hidden">{missing?tr(`${missing} دون تحديد`,`${missing} unselected`):tr('كل الحالات محددة','All statuses selected')}</p><button type="button" aria-label={tr('تحديد الكل حاضر','Mark all present')} onClick={markAllPresent} disabled={isFuture} className="shrink-0 rounded-lg border border-teal-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-teal-800 disabled:opacity-40 sm:px-3 sm:py-2"><span className="sm:hidden">{tr('الكل حاضر','All present')}</span><span className="hidden sm:inline">{tr('تحديد الكل حاضر','Mark all present')}</span></button></div>
          <div className="divide-y divide-slate-100">{rows.map(student=>{const value=draft[student.id]??{status:'',note:''};const showNote=expandedNote===student.id||value.status==='excused'||Boolean(value.note);return <article key={student.id} className="space-y-2 px-3 py-2.5 sm:space-y-3 sm:px-5 sm:py-4">
            <div className="flex min-w-0 items-center gap-2.5"><SupervisorStudentPhoto student={student} ar={ar}/><div className="min-w-0"><b className="block truncate text-xs text-slate-900">{studentName(student,ar)}</b><small dir="ltr" className="block text-[10px] text-slate-500">{student.university_number}</small></div></div>
            <div className="grid grid-cols-4 gap-1" role="group" aria-label={tr(`حالة ${student.full_name_ar}`,`Status of ${studentName(student,false)}`)}>{statusOptions.map(option=><button type="button" key={option.value} disabled={isFuture} aria-pressed={value.status===option.value} onClick={()=>setStatus(student.id,option.value)} className={`min-h-10 rounded-lg border px-1 text-[11px] font-bold transition disabled:opacity-40 ${value.status===option.value?option.active:'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{ar?option.ar:option.en}</button>)}</div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">{showNote?<label className="block w-full text-[11px] font-bold text-slate-700">{tr('ملاحظة سجل الحضور — تظهر للجهات المخوّلة','Official attendance note — visible to authorized reviewers')}<textarea aria-label={tr(`ملاحظة ${student.full_name_ar}`,`Note for ${studentName(student,false)}`)} value={value.note} onChange={event=>setNote(student.id,event.target.value)} disabled={isFuture} rows={2} maxLength={2000} placeholder={value.status==='excused'?tr('اكتب سبب العذر (مطلوب)','Enter the excuse reason (required)'):tr('ملاحظة مرتبطة بحضور هذا اليوم','Note about this day’s attendance')} className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-normal leading-5 outline-none focus:border-teal-500 disabled:bg-slate-50"/></label>:<button type="button" aria-label={tr('إضافة ملاحظة رسمية','Add official note')} onClick={()=>setExpandedNote(student.id)} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600 hover:text-teal-800"><StickyNote className="h-3.5 w-3.5"/>{tr('ملاحظة رسمية','Official note')}</button>}
            <SupervisorStudentNotesButton student={student} group={group} notes={workspace.data.student_notes??[]} appearance="quiet"/></div>
          </article>;})}</div>
          <footer className="hidden space-y-2 border-t border-slate-100 bg-slate-50/60 px-4 py-4 sm:block sm:px-5">{isFuture&&<p className="text-xs font-bold text-amber-800">{tr('هذا اليوم لم يبدأ بعد؛ يمكن تسجيل الحضور في يومه أو بعده.','This date is in the future; attendance can be recorded on or after that day.')}</p>}{missing>0&&<p className="text-xs text-slate-600">{tr(`حدّد حالة ${missing} طالب قبل الحفظ.`,`Select a status for ${missing} student(s) before saving.`)}</p>}{missingExcuses>0&&<p className="text-xs font-bold text-amber-800">{tr('اكتب سبب العذر لكل طالب حُددت حالته «بعذر».','Provide a reason for each excused student.')}</p>}
            {save.isError&&<p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{String(error)}</p>}{notice&&<p role="status" className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-800"><Check className="h-4 w-4"/>{notice}</p>}
            <button type="button" onClick={()=>save.mutate()} disabled={!canSave} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"><Save className="h-4 w-4"/>{save.isPending?tr('جارٍ الحفظ…','Saving…'):tr('حفظ حضور المجموعة','Save group attendance')}</button>
            {!changed&&day.data?.records.length===rows.length&&<p className="inline-flex items-center gap-1.5 text-[11px] font-bold text-teal-800"><ClipboardCheck className="h-4 w-4"/>{tr('سجل المجموعة محفوظ ومكتمل.','Group register saved and complete.')}</p>}
          </footer>
        </>}
      </section>}
      {group&&day.data&&!day.data.qr_session&&<aside aria-label={tr('حفظ الحضور على الهاتف','Mobile attendance save')} className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-3 pt-2 shadow-[0_-6px_24px_rgba(15,23,42,0.08)] backdrop-blur-md pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden">
        {(save.isError||notice)&&<p role="status" className={`mb-1.5 truncate text-[11px] font-bold ${save.isError?'text-rose-700':'text-teal-800'}`}>{save.isError?String(error):notice}</p>}
        <div className="mx-auto flex max-w-5xl items-center gap-3"><div className="min-w-0 flex-1 text-[11px] font-bold text-slate-700"><span className="block">{completed}/{rows.length} {tr('طالب','students')}</span><span className={`block truncate text-[10px] ${missingExcuses||isFuture?'text-amber-700':'text-slate-500'}`}>{isFuture?tr('اليوم لم يبدأ بعد','Future day'):missingExcuses?tr('سبب العذر مطلوب','Excuse reason required'):missing?tr(`باقي ${missing}`,`${missing} remaining`):changed?tr('جاهز للحفظ','Ready to save'):tr('السجل محفوظ','Saved')}</span></div><button type="button" onClick={()=>save.mutate()} disabled={!canSave} className="inline-flex min-h-11 flex-[1.2] items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-3 text-xs font-black text-white disabled:bg-slate-300"><Save className="h-4 w-4"/>{save.isPending?tr('جارٍ الحفظ…','Saving…'):tr('حفظ المجموعة','Save group')}</button></div>
      </aside>}
    </>}
  </div>;
}
