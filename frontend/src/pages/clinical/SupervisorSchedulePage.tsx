import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, MapPin, Users } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate, formatWeekday, groupName, groupSupervisorAssignments, today, type SupervisorGroup, type Workspace } from './supervisorWorkspace';

function target(group:SupervisorGroup,date:string,screen:'attendance'|'assessments'){
  const values=new URLSearchParams({group:group.key});
  if(screen==='attendance')values.set('date',date);
  else {const week=group.evaluationWeeks.find(item=>date>=item.start_date&&date<=item.end_date);if(week)values.set('week',String(week.number));}
  return `/supervisor/${screen}?${values}`;
}

export function SupervisorScheduleAgenda({workspace}:{workspace:Workspace}){
  const {locale}=useI18n();const ar=locale==='ar';const tr=(a:string,e:string)=>ar?a:e;
  const agenda=useMemo(()=>groupSupervisorAssignments(workspace.assignments??[]).flatMap(group=>group.scheduledDates.map(date=>({date,group}))).sort((a,b)=>a.date.localeCompare(b.date)),[workspace.assignments]);
  return <section className="space-y-4">
    <div><h2 className="text-xl font-black text-slate-900">{tr('جدولي السريري','My clinical schedule')}</h2><p className="mt-1 text-xs text-slate-500">{tr('اختر الحضور أو التقييم من الجلسة للانتقال إلى مجموعتها مباشرة.','Open attendance or assessment from a session to select its group automatically.')}</p></div>
    {!agenda.length?<EmptyState message={tr('لا توجد جلسات ظاهرة. راجع التكليف المنشور وأيام العمل المحددة لك.','No sessions are available. Review the published assignment and your configured work days.')}/>:<div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-[130px_100px_minmax(260px,1fr)_230px] border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-black text-slate-500"><span>{tr('التاريخ','Date')}</span><span>{tr('اليوم','Day')}</span><span>{tr('المجموعة والتكليف','Group and assignment')}</span><span>{tr('الإجراءات','Actions')}</span></div>
        <div className="divide-y divide-slate-100">{agenda.map(({date,group})=>{const past=date<today(),isToday=date===today();return <article key={`${date}-${group.key}`} className={`grid grid-cols-[130px_100px_minmax(260px,1fr)_230px] items-center gap-0 px-4 py-4 transition hover:bg-slate-50 ${past?'opacity-65':''} ${isToday?'bg-teal-50/70':''}`}>
          <span dir="ltr" className="inline-flex w-fit items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-800"><CalendarDays className="h-4 w-4 text-teal-700"/>{formatDate(date,ar)}</span>
          <span className={`w-fit rounded-lg px-2.5 py-1.5 text-xs font-black ${isToday?'bg-amber-100 text-amber-800':'border border-slate-200 bg-white text-slate-700'}`}>{isToday?`${tr('اليوم','Today')} · ${formatWeekday(date,ar)}`:formatWeekday(date,ar)}</span>
          <div><h3 className="font-black text-slate-900">{groupName(group,ar)}</h3><p className="mt-1 flex flex-wrap gap-3 text-[11px] text-slate-500"><span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5"/>{ar?group.siteAr:group.siteEn}</span><span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5"/>{group.students.length} {tr('طالب','students')}</span></p></div>
          <div className="flex gap-2"><Link to={target(group,date,'attendance')} className="rounded-xl bg-teal-700 px-3 py-2 text-xs font-bold text-white hover:bg-teal-800">{tr('رصد الحضور','Attendance')}</Link><Link to={target(group,date,'assessments')} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-teal-300">{tr('التقييم الأسبوعي','Assessment')}</Link></div>
        </article>})}</div>
      </div>
    </div>}
  </section>;
}
