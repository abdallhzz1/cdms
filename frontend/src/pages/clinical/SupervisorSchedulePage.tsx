import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, MapPin, Users } from 'lucide-react';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { formatDate, groupName, groupSupervisorAssignments, today, workspaceQueryKey, type SupervisorGroup, type Workspace } from './supervisorWorkspace';

function target(group:SupervisorGroup,date:string,screen:'attendance'|'assessments'){
  const values=new URLSearchParams({group:group.key});
  if(screen==='attendance')values.set('date',date);
  else {const week=group.evaluationWeeks.find(item=>date>=item.start_date&&date<=item.end_date);if(week)values.set('week',String(week.number));}
  return `/supervisor/${screen}?${values}`;
}

export function SupervisorSchedulePage(){
  const {user,can}=useAuth();const {locale}=useI18n();const ar=locale==='ar';const tr=(a:string,e:string)=>ar?a:e;
  const isSupervisor=(user?.roles??[]).some(role=>String(role).toUpperCase()==='CLINICAL_SUPERVISOR');
  const query=useQuery({queryKey:workspaceQueryKey,queryFn:()=>apiFetch<Workspace>('/operational/my-supervisor-workspace'),enabled:isSupervisor&&can('supervisor.workspace.view')});
  const agenda=useMemo(()=>groupSupervisorAssignments(query.data?.assignments??[]).flatMap(group=>group.scheduledDates.map(date=>({date,group}))).sort((a,b)=>a.date.localeCompare(b.date)),[query.data?.assignments]);
  if(!isSupervisor||!can('supervisor.workspace.view'))return <ErrorState title={tr('الصلاحية غير مفعلة','Permission is disabled')}/>;
  if(query.isLoading)return <LoadingState/>;if(query.isError||!query.data)return <ErrorState onRetry={()=>query.refetch()}/>;
  return <div className="mx-auto max-w-6xl space-y-5 pb-16">
    <Link to="/supervisor/portal" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold"><ArrowRight className="h-4 w-4"/>{tr('الرجوع للوحة المشرف','Back to dashboard')}</Link>
    <PageHeader title={tr('جدولي السريري','My clinical schedule')} description={tr('اختر الحضور أو التقييم من أي جلسة للانتقال مباشرة إلى مجموعتها.','Open attendance or assessment from any session to select its group automatically.')}/>
    {!agenda.length?<ErrorState title={tr('لا توجد جلسات ظاهرة','No sessions available')} message={tr('راجع تكليفات الجدول وأيام العمل المحددة لك في المواقع التدريبية.','Review your schedule assignments and configured work days.')}/>:<div className="space-y-3">{agenda.map(({date,group})=>{const past=date<today(),isToday=date===today();return <article key={`${date}-${group.key}`} className={`grid gap-4 rounded-2xl border bg-white p-4 shadow-sm sm:grid-cols-[160px_1fr_auto] sm:items-center ${isToday?'border-teal-400 ring-2 ring-teal-100':'border-slate-200'} ${past?'opacity-60':''}`}>
      <div><span className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black ${isToday?'bg-teal-700 text-white':'bg-slate-100 text-slate-700'}`}><CalendarDays className="h-4 w-4"/>{isToday?tr('اليوم','Today'):formatDate(date,ar)}</span></div>
      <div><h2 className="font-black text-slate-900">{groupName(group,ar)}</h2><p className="mt-1 flex flex-wrap gap-3 text-[11px] text-slate-500"><span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5"/>{ar?group.siteAr:group.siteEn}</span><span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5"/>{group.students.length} {tr('طالب','students')}</span></p></div>
      <div className="flex gap-2"><Link to={target(group,date,'attendance')} className="rounded-xl bg-teal-700 px-3 py-2 text-xs font-bold text-white">{tr('رصد الحضور','Attendance')}</Link><Link to={target(group,date,'assessments')} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">{tr('التقييم الأسبوعي','Assessment')}</Link></div>
    </article>})}</div>}
  </div>;
}
