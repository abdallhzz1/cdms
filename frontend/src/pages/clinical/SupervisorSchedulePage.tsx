import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, MapPin, Users } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate, formatWeekday, groupName, groupSupervisorAssignments, today, type SupervisorGroup, type Workspace } from './supervisorWorkspace';

function target(group:SupervisorGroup,date:string,screen:'attendance'|'assessments'){
  const values=new URLSearchParams({group:group.key});
  if(screen==='attendance')values.set('date',date);
  else {const week=group.evaluationWeeks.find(item=>date>=item.start_date&&date<=item.end_date);if(week)values.set('week',String(week.number));}
  return screen === 'attendance' ? `/supervisor/attendance/qr?${values}` : `/supervisor/assessments?${values}`;
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

function agendaWeekEnd(start:string):string{
  const day=new Date(`${start}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate()+6);
  return day.toISOString().slice(0,10);
}

export function preferredAgendaWeek<T extends {date:string}>(items:T[],currentDate=today()):string{
  const weeks=[...new Set(items.map(item=>agendaWeekStart(item.date)))].sort();
  const current=agendaWeekStart(currentDate);
  return weeks.includes(current)?current:weeks.find(week=>week>current)??weeks.at(-1)??'';
}

export function SupervisorScheduleAgenda({workspace}:{workspace:Workspace}){
  const {locale}=useI18n();const ar=locale==='ar';const tr=(a:string,e:string)=>ar?a:e;
  const [currentDate,setCurrentDate]=useState(today);
  const [selectedWeek,setSelectedWeek]=useState('');
  useEffect(()=>{const timer=window.setInterval(()=>setCurrentDate(value=>{const next=today();return next===value?value:next;}),60_000);return()=>window.clearInterval(timer);},[]);
  const agenda=useMemo(()=>sortAgendaByNextSession(groupSupervisorAssignments(workspace.assignments??[]).flatMap(group=>group.scheduledDates.map(date=>({date,group}))),currentDate),[workspace.assignments,currentDate]);
  const weeks=useMemo(()=>[...new Set(agenda.map(item=>agendaWeekStart(item.date)))].sort(),[agenda]);
  const activeWeek=selectedWeek&&weeks.includes(selectedWeek)?selectedWeek:preferredAgendaWeek(agenda,currentDate);
  const mobileRows=agenda.filter(item=>agendaWeekStart(item.date)===activeWeek);
  const sharedCourse=mobileRows.length>1&&new Set(mobileRows.map(({group})=>ar?group.courseAr:group.courseEn)).size===1
    ? (ar?mobileRows[0].group.courseAr:mobileRows[0].group.courseEn) : null;
  return <section className="min-w-0 space-y-3 sm:space-y-4">
    <div><h2 className="text-lg font-black text-slate-900 sm:text-xl">{tr('جدولي السريري','My clinical schedule')}</h2><p className="mt-1 text-xs text-slate-500">{tr('أيام عملك المنشورة وروابط الحضور والتقييم.','Your published work days and direct attendance and assessment links.')}</p></div>
    {!agenda.length?<EmptyState message={tr('لا توجد جلسات ظاهرة. راجع التكليف المنشور وأيام العمل المحددة لك.','No sessions are available. Review the published assignment and your configured work days.')}/>:<>
      <div className="min-w-0 space-y-2 md:hidden">
        <label className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700"><CalendarDays className="h-4 w-4 shrink-0 text-teal-700"/><span className="shrink-0">{tr('الأسبوع','Week')}</span><select aria-label={tr('اختيار الأسبوع','Choose week')} value={activeWeek} onChange={event=>setSelectedWeek(event.target.value)} className="min-w-0 flex-1 bg-transparent py-1 text-xs font-bold text-slate-800 outline-none">{weeks.map(week=><option key={week} value={week}>{week===agendaWeekStart(currentDate)?tr('هذا الأسبوع','This week'):''} {formatDate(week,ar)} – {formatDate(agendaWeekEnd(week),ar)}</option>)}</select></label>
        {sharedCourse&&<p className="px-1 text-xs font-bold text-slate-600">{tr('المساق','Course')}: {sharedCourse}</p>}
        <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full table-fixed text-right text-xs"><thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-black text-slate-500"><tr><th className="w-[92px] px-2.5 py-2.5">{tr('اليوم','Day')}</th><th className="px-2.5 py-2.5">{tr('المجموعة والتكليف','Group and assignment')}</th></tr></thead><tbody className="divide-y divide-slate-100">{mobileRows.map(({date,group})=>{const isToday=date===currentDate;const past=date<currentDate;return <tr key={`${date}-${group.key}`} className={isToday?'bg-teal-50/70':past?'bg-slate-50/40':''}>
            <td className="w-[92px] align-top px-2.5 py-3"><span className={`block w-fit rounded-lg px-2 py-1 text-[11px] font-black ${isToday?'bg-amber-100 text-amber-900':'bg-slate-100 text-slate-700'}`}>{isToday?tr('اليوم','Today'):formatWeekday(date,ar)}</span><span dir="ltr" className="mt-1.5 block text-[10px] font-bold text-slate-500">{formatDate(date,ar)}</span></td>
            <td className="min-w-0 align-top px-2.5 py-3"><h3 className="break-words text-xs font-black leading-5 text-slate-900">{sharedCourse?`${group.group} (${group.subgroup})`:groupName(group,ar)}</h3><div className="mt-1 flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 text-[10px] leading-4 text-slate-500"><span className="inline-flex min-w-0 items-start gap-0.5"><MapPin className="mt-0.5 h-3 w-3 shrink-0"/><span className="min-w-0 break-words">{ar?group.siteAr:group.siteEn}</span></span><span className="inline-flex items-center gap-0.5"><Users className="h-3 w-3"/>{group.students.length} {tr('طالب','students')}</span></div><div className="mt-2 flex flex-wrap gap-1.5"><Link to={target(group,date,'attendance')} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-black ${isToday?'bg-teal-700 text-white':'border border-teal-200 bg-white text-teal-800'}`}>{tr('فتح حضور QR','Open QR attendance')}</Link><Link to={target(group,date,'assessments')} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-700">{tr('التقييم','Assessment')}</Link></div></td>
          </tr>})}</tbody></table>
        </div>
      </div>
      <div className="hidden overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm md:block">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-[100px_120px_minmax(260px,1fr)_220px] border-b border-slate-200 bg-slate-50 px-4 py-3 text-[10px] font-black text-slate-500"><span>{tr('اليوم','Day')}</span><span>{tr('التاريخ','Date')}</span><span>{tr('المجموعة والتكليف','Group and assignment')}</span><span>{tr('الإجراءات','Actions')}</span></div>
        <div className="divide-y divide-slate-100">{agenda.map(({date,group})=>{const past=date<currentDate,isToday=date===currentDate;return <article key={`${date}-${group.key}`} className={`grid grid-cols-[100px_120px_minmax(260px,1fr)_220px] items-center gap-0 px-4 py-3.5 text-[11px] transition hover:bg-slate-50 ${past?'opacity-65':''} ${isToday?'bg-teal-50/70':''}`}>
          <span className={`w-fit rounded-lg px-2.5 py-1.5 text-[11px] font-black ${isToday?'bg-amber-100 text-amber-800':'border border-slate-200 bg-white text-slate-700'}`}>{isToday?`${tr('اليوم','Today')} · ${formatWeekday(date,ar)}`:formatWeekday(date,ar)}</span>
          <span dir="ltr" className="inline-flex w-fit whitespace-nowrap rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-black text-slate-800">{formatDate(date,ar)}</span>
          <div><h3 className="text-xs font-black text-slate-900">{groupName(group,ar)}</h3><p className="mt-1 flex flex-wrap gap-3 text-[10px] text-slate-500"><span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3"/>{ar?group.siteAr:group.siteEn}</span><span className="inline-flex items-center gap-1"><Users className="h-3 w-3"/>{group.students.length} {tr('طالب','students')}</span></p></div>
          <div className="flex gap-2"><Link to={target(group,date,'attendance')} className="rounded-lg bg-teal-700 px-3 py-2 text-[11px] font-bold text-white hover:bg-teal-800">{tr('الحضور عبر QR','QR attendance')}</Link><Link to={target(group,date,'assessments')} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 hover:border-teal-300">{tr('التقييم الأسبوعي','Assessment')}</Link></div>
        </article>})}</div>
      </div>
      </div>
    </>}
  </section>;
}
