import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, MapPin, Users } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/auth/AuthContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate, formatWeekday, groupName, groupSupervisorAssignments, today, type SupervisorGroup, type Workspace } from './supervisorWorkspace';

function target(group:SupervisorGroup,date:string,screen:'attendance'|'assessments'){
  const values=new URLSearchParams({group:group.key});
  if(screen==='attendance')values.set('date',date);
  else {const week=group.evaluationWeeks.find(item=>date>=item.start_date&&date<=item.end_date);if(week)values.set('week',String(week.number));}
  return screen === 'attendance' ? `/supervisor/attendance?${values}` : `/supervisor/assessments?${values}`;
}

export function sortAgendaByNextSession<T extends {date:string}>(items:T[],currentDate=today()):T[]{
  return [...items].sort((a,b)=>{
    const aIsPast=a.date<currentDate,bIsPast=b.date<currentDate;
    if(aIsPast!==bIsPast)return aIsPast?1:-1;
    return aIsPast?b.date.localeCompare(a.date):a.date.localeCompare(b.date);
  });
}

/** Calendar weeks begin on Sunday, matching the clinical work-week display. */
export function agendaWeekStart(date:string):string{
  const day=new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate()-day.getUTCDay());
  return day.toISOString().slice(0,10);
}

function addDays(value:string,count:number):string{
  const day=new Date(`${value}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate()+count);
  return day.toISOString().slice(0,10);
}

function agendaWeekEnd(start:string):string{return addDays(start,6);}

export function preferredAgendaWeek<T extends {date:string}>(items:T[],currentDate=today()):string{
  const weeks=[...new Set(items.map(item=>agendaWeekStart(item.date)))].sort();
  const current=agendaWeekStart(currentDate);
  return weeks.includes(current)?current:weeks.find(week=>week>current)??weeks.at(-1)??'';
}

export type AgendaDuty={siteId:number|null;siteAr:string;siteEn:string;groups:SupervisorGroup[]};
export type AgendaDay={date:string;duties:AgendaDuty[]};

/** Work sites are independent of student assignments: a site without a group must still appear. */
export function buildSupervisorAgenda(workspace:Workspace,currentDate=today()):AgendaDay[]{
  const groups=groupSupervisorAssignments(workspace.assignments??[]);
  const duties=new Map<string,Map<string,AgendaDuty>>();
  const addDuty=(date:string,siteId:number|null,siteAr:string,siteEn:string)=>{
    if(!duties.has(date))duties.set(date,new Map());
    const sites=duties.get(date)!;
    const key=String(siteId??'unknown');
    if(!sites.has(key))sites.set(key,{siteId,siteAr,siteEn,groups:[]});
    return sites.get(key)!;
  };

  const weekdays=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  for(const schedule of workspace.work_schedules??[]){
    const workDays=new Set((schedule.days??[]).filter(day=>day.status==='work').map(day=>day.day.toLowerCase()));
    if(!workDays.size)continue;
    // Open-ended legacy schedules are shown around the current week; dated schedules retain their real bounds.
    const start=schedule.valid_from??agendaWeekStart(currentDate);
    const end=schedule.valid_until??agendaWeekEnd(agendaWeekStart(currentDate));
    if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||start>end)continue;
    for(let date=start;date<=end;date=addDays(date,1)){
      const weekday=weekdays[new Date(`${date}T12:00:00Z`).getUTCDay()];
      if(workDays.has(weekday))addDuty(date,schedule.training_site_id,schedule.training_site?.name_ar??'غير محدد',schedule.training_site?.name_en??schedule.training_site?.name_ar??'Not specified');
    }
  }

  for(const group of groups)for(const date of group.scheduledDates){
    const duty=addDuty(date,group.siteId,group.siteAr,group.siteEn);
    if(!duty.groups.some(item=>item.key===group.key))duty.groups.push(group);
  }

  const weeks=[...new Set([...duties.keys()].map(agendaWeekStart))].sort();
  return weeks.flatMap(week=>Array.from({length:7},(_,index)=>{
    const date=addDays(week,index);
    return {date,duties:[...(duties.get(date)?.values()??[])].sort((a,b)=>a.siteAr.localeCompare(b.siteAr,'ar'))};
  }));
}

export function SupervisorScheduleAgenda({workspace}:{workspace:Workspace}){
  const {locale}=useI18n();const ar=locale==='ar';const tr=(a:string,e:string)=>ar?a:e;
  const {can}=useAuth();const canRecordAttendance=can('attendance.record');const canAssessStudents=can('assessment.create');
  const [currentDate,setCurrentDate]=useState(today);
  const [selectedWeek,setSelectedWeek]=useState('');
  useEffect(()=>{const timer=window.setInterval(()=>setCurrentDate(value=>{const next=today();return next===value?value:next;}),60_000);return()=>window.clearInterval(timer);},[]);
  const agenda=useMemo(()=>buildSupervisorAgenda(workspace,currentDate),[workspace,currentDate]);
  const weeks=useMemo(()=>[...new Set(agenda.map(item=>agendaWeekStart(item.date)))],[agenda]);
  const activeWeek=selectedWeek&&weeks.includes(selectedWeek)?selectedWeek:preferredAgendaWeek(agenda.filter(item=>item.duties.length),currentDate);
  const rows=agenda.filter(item=>agendaWeekStart(item.date)===activeWeek);
  const currentWeek=agendaWeekStart(currentDate);
  const weekLabel=(week:string)=>{
    const shortDate=formatDate(week,ar).slice(0,5);
    const label=week===currentWeek?tr('هذا الأسبوع','This week')
      :week===addDays(currentWeek,7)?tr('الأسبوع القادم','Next week')
      :week===addDays(currentWeek,-7)?tr('الأسبوع الماضي','Last week')
      :null;
    return label?`${label} · ${shortDate}`:`${tr('أسبوع يبدأ في','Week starting')} ${shortDate}`;
  };

  const dutyContent=(duty:AgendaDuty,date:string)=>(
    <div key={String(duty.siteId)} className="rounded-xl border border-teal-100 bg-teal-50/50 px-3 py-2.5">
      <p className="flex items-start gap-1.5 text-xs font-black leading-5 text-teal-900"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0"/>{ar?duty.siteAr:duty.siteEn}</p>
      {!duty.groups.length?<p className="mt-1 text-[11px] text-slate-600">{tr('دوام في المركز · لا توجد مجموعة مكلفة لهذا اليوم','On duty at this site · no group assigned for this day')}</p>:duty.groups.map(group=><div key={group.key} className="mt-2 border-t border-teal-100 pt-2 first:mt-0 first:border-0 first:pt-0">
        <p className="text-xs font-bold leading-5 text-slate-900">{groupName(group,ar)}</p>
        <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-slate-500"><Users className="h-3 w-3"/>{group.students.length} {tr('طالب','students')}</p>
        {(canRecordAttendance||canAssessStudents)&&<div className="mt-2 flex flex-wrap gap-1.5">
          {canRecordAttendance&&<Link to={target(group,date,'attendance')} className="rounded-lg bg-teal-700 px-2.5 py-1.5 text-[10px] font-black text-white hover:bg-teal-800">{tr('تسجيل الحضور','Record attendance')}</Link>}
          {canAssessStudents&&<Link to={target(group,date,'assessments')} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-700">{tr('التقييم','Assessment')}</Link>}
        </div>}
      </div>)}
    </div>
  );

  return <section className="min-w-0 space-y-3 sm:space-y-4">
    <div><h2 className="text-lg font-black text-slate-900 sm:text-xl">{tr('جدولي السريري','My clinical schedule')}</h2><p className="mt-1 text-xs text-slate-500">{tr('الأسبوع كاملًا، مع جميع مراكز دوامك والمجموعات المكلف بها.','Your full week, including every work site and assigned group.')}</p></div>
    {!agenda.length?<EmptyState message={tr('لا توجد جلسات ظاهرة. راجع التكليف المنشور وأيام العمل المحددة لك.','No sessions are available. Review the published assignment and your configured work days.')}/>:<>
      <div className="w-full min-w-0 space-y-1.5 sm:max-w-sm">
        <label className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700"><CalendarDays className="h-4 w-4 shrink-0 text-teal-700"/><span className="shrink-0">{tr('الأسبوع','Week')}</span><select aria-label={tr('اختيار الأسبوع','Choose week')} value={activeWeek} onChange={event=>setSelectedWeek(event.target.value)} className="min-w-0 flex-1 bg-transparent py-1 text-xs font-bold text-slate-800 outline-none">{weeks.map(week=><option key={week} value={week}>{weekLabel(week)}</option>)}</select></label>
        <p className="px-1 text-[11px] font-medium text-slate-500">{tr('الفترة','Dates')}: <span dir="ltr" className="inline-block font-bold text-slate-700">{formatDate(activeWeek,ar)} – {formatDate(agendaWeekEnd(activeWeek),ar)}</span></p>
      </div>
      <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:rounded-3xl">
        <table className="w-full table-fixed text-right text-xs"><thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-black text-slate-500"><tr><th className="w-[94px] px-2.5 py-3 sm:w-[180px] sm:px-5">{tr('اليوم','Day')}</th><th className="px-2.5 py-3 sm:px-5">{tr('المركز والمجموعة','Site and group')}</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{rows.map(({date,duties})=>{const isToday=date===currentDate;return <tr key={date} className={isToday?'bg-teal-50/40':''}>
            <td className="align-top px-2.5 py-3 sm:px-5"><span className={`block w-fit rounded-lg px-2 py-1 text-[11px] font-black ${isToday?'bg-amber-100 text-amber-900':'bg-slate-100 text-slate-700'}`}>{isToday?`${tr('اليوم','Today')} · ${formatWeekday(date,ar)}`:formatWeekday(date,ar)}</span><span dir="ltr" className="mt-1.5 block text-[10px] font-bold text-slate-500">{formatDate(date,ar)}</span></td>
            <td className="min-w-0 align-top px-2.5 py-2.5 sm:px-5">{duties.length?<div className="space-y-2">{duties.map(duty=>dutyContent(duty,date))}</div>:<span className="inline-flex rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-500">{tr('لا يوجد دوام','No duty')}</span>}</td>
          </tr>})}</tbody>
        </table>
      </div>
    </>}
  </section>;
}
