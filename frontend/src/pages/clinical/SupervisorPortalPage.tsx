import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Award, CheckCircle2, ClipboardCheck, ClipboardList } from 'lucide-react';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SupervisorScheduleAgenda } from './SupervisorSchedulePage';
import { workspaceQueryKey, type Workspace } from './supervisorWorkspace';

export function SupervisorPortalPage(){
  const {user,can}=useAuth();const {locale,t}=useI18n();const ar=locale==='ar';const tr=(a:string,e:string)=>ar?a:e;
  const isSupervisor=(user?.roles??[]).some(role=>String(role).toUpperCase()==='CLINICAL_SUPERVISOR');
  const query=useQuery({queryKey:workspaceQueryKey,queryFn:()=>apiFetch<Workspace>('/operational/my-supervisor-workspace'),enabled:isSupervisor&&can('supervisor.workspace.view')});
  if(!isSupervisor)return <ErrorState title={tr('لوحة المشرف السريري','Clinical supervisor dashboard')} message={tr('هذه المساحة مخصصة لحسابات المشرفين السريريين.','This workspace is for clinical supervisor accounts.')}/>;
  if(!can('supervisor.workspace.view'))return <ErrorState title={tr('الصلاحية غير مفعلة','Permission is disabled')}/>;
  if(query.isLoading)return <LoadingState/>;if(query.isError||!query.data)return <ErrorState onRetry={()=>query.refetch()}/>;
  const name=ar?query.data.supervisor.full_name_ar:query.data.supervisor.full_name_en||query.data.supervisor.full_name_ar;
  const canRecordAttendance=can('attendance.record');
  const canAssessStudents=can('assessment.create');
  const canEnterOsce=canAssessStudents&&query.data.assignments.some(assignment=>{const osce=assignment.rotation_block?.rotation?.course?.assessment_components?.find(component=>component.code==='osce');return !!osce&&Number(osce.max_score)>0&&osce.osce_entry_mode!=='assistant';});
  const actionCount=Number(canRecordAttendance)+Number(canAssessStudents)+Number(canEnterOsce);
  const actionClass='flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-xl border border-teal-200 bg-white px-3 py-3 text-xs font-bold text-teal-800 hover:border-teal-400 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 sm:text-sm';
  return <div className="mx-auto w-full min-w-0 max-w-7xl space-y-4 pb-16 sm:space-y-7">
    <header className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-teal-950 to-teal-800 px-4 py-4 text-white shadow-sm shadow-teal-950/10 sm:rounded-[2rem] sm:px-9 sm:py-10 sm:shadow-xl">
      <div className="absolute -start-16 -top-20 h-56 w-56 rounded-full bg-teal-400/10 blur-3xl"/><div className="absolute -bottom-24 end-0 h-64 w-64 rounded-full bg-cyan-300/10 blur-3xl"/>
      <div className="relative"><span className="hidden items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-bold text-teal-50 sm:inline-flex"><CheckCircle2 className="h-3.5 w-3.5"/>{tr('مساحة العمل السريرية','Clinical workspace')}</span><h1 className="text-lg font-black leading-7 tracking-tight sm:mt-5 sm:text-3xl">{tr('مرحباً دكتور،','Welcome Doctor,')} {name}</h1></div>
    </header>
    {(canRecordAttendance||canAssessStudents)&&<nav aria-label={t('supervisorPortal.actions')} className={`grid w-full gap-2 sm:max-w-3xl ${actionCount===1?'grid-cols-1':actionCount===2?'grid-cols-2':'grid-cols-2 sm:grid-cols-3'}`}>
      {canRecordAttendance&&<Link to="/supervisor/attendance" className={actionClass}><ClipboardList aria-hidden="true" className="h-5 w-5 shrink-0"/><span>{t('supervisorPortal.attendance')}</span></Link>}
      {canAssessStudents&&<Link to="/supervisor/assessments" className={actionClass}><ClipboardCheck aria-hidden="true" className="h-5 w-5 shrink-0"/><span>{t('supervisorPortal.assessments')}</span></Link>}
      {canEnterOsce&&<Link to="/supervisor/osce" className={`${actionClass} ${actionCount===3?'col-span-2 sm:col-span-1':''}`}><Award aria-hidden="true" className="h-5 w-5 shrink-0"/><span>{tr('OSCE النهائي','Final OSCE')}</span></Link>}
    </nav>}
    <SupervisorScheduleAgenda workspace={query.data}/>
  </div>;
}
