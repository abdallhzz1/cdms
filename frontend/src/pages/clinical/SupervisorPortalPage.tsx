import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SupervisorScheduleAgenda } from './SupervisorSchedulePage';
import { workspaceQueryKey, type Workspace } from './supervisorWorkspace';

export function SupervisorPortalPage(){
  const {user,can}=useAuth();const {locale}=useI18n();const ar=locale==='ar';const tr=(a:string,e:string)=>ar?a:e;
  const isSupervisor=(user?.roles??[]).some(role=>String(role).toUpperCase()==='CLINICAL_SUPERVISOR');
  const query=useQuery({queryKey:workspaceQueryKey,queryFn:()=>apiFetch<Workspace>('/operational/my-supervisor-workspace'),enabled:isSupervisor&&can('supervisor.workspace.view')});
  if(!isSupervisor)return <ErrorState title={tr('لوحة المشرف السريري','Clinical supervisor dashboard')} message={tr('هذه المساحة مخصصة لحسابات المشرفين السريريين.','This workspace is for clinical supervisor accounts.')}/>;
  if(!can('supervisor.workspace.view'))return <ErrorState title={tr('الصلاحية غير مفعلة','Permission is disabled')}/>;
  if(query.isLoading)return <LoadingState/>;if(query.isError||!query.data)return <ErrorState onRetry={()=>query.refetch()}/>;
  const name=ar?query.data.supervisor.full_name_ar:query.data.supervisor.full_name_en||query.data.supervisor.full_name_ar;
  return <div className="mx-auto max-w-7xl space-y-7 pb-16">
    <header className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-950 via-teal-950 to-teal-800 px-6 py-8 text-white shadow-xl shadow-teal-950/10 sm:px-9 sm:py-10">
      <div className="absolute -start-16 -top-20 h-56 w-56 rounded-full bg-teal-400/10 blur-3xl"/><div className="absolute -bottom-24 end-0 h-64 w-64 rounded-full bg-cyan-300/10 blur-3xl"/>
      <div className="relative"><span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-bold text-teal-50"><CheckCircle2 className="h-3.5 w-3.5"/>{tr('مساحة العمل السريرية','Clinical workspace')}</span><h1 className="mt-5 text-2xl font-black tracking-tight sm:text-3xl">{tr('مرحباً دكتور،','Welcome Doctor,')} {name}</h1></div>
    </header>
    <SupervisorScheduleAgenda workspace={query.data}/>
  </div>;
}
