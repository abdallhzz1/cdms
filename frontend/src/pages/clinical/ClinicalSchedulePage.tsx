import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  Check, ChevronLeft, ChevronRight, Copy, ExternalLink, FilterX,
  Link2, Search, ShieldCheck,
} from 'lucide-react';
import type { ClinicalScheduleItem, PaginatedResponse } from '@/api/distribution';

type PortalStatus={is_enabled:boolean;public_url:string;updated_at:string|null;updated_by:{name:string}|null};
type DashboardOptions={
  rotations:{id:number;name:string;name_en:string;code:string;academic_level:string;academic_year_id:number;academic_year:string}[];
  sites:{id:number;name_ar:string;name_en:string|null}[];
};
const levels:Record<string,{ar:string;en:string}>={fourth:{ar:'السنة الرابعة',en:'Fourth year'},fifth:{ar:'السنة الخامسة',en:'Fifth year'},sixth:{ar:'السنة السادسة',en:'Sixth year'}};

export function ClinicalSchedulePage() {
  const {can,user}=useAuth();
  const {locale}=useI18n();
  const qc=useQueryClient();
  const [search,setSearch]=useState('');
  const [siteFilter,setSiteFilter]=useState('');
  const [levelFilter,setLevelFilter]=useState('');
  const [rotationFilter,setRotationFilter]=useState('');
  const [page,setPage]=useState(1);
  const [notice,setNotice]=useState('');
  const [actionError,setActionError]=useState('');
  const hasAccess=can('clinical_schedule.view');
  const canManagePortal=can('distribution.student_portal.manage');

  const params=new URLSearchParams({page:String(page),per_page:'50'});
  if(search.trim())params.set('search',search.trim());
  if(siteFilter)params.set('training_site_id',siteFilter);
  if(levelFilter)params.set('academic_level',levelFilter);
  if(rotationFilter)params.set('rotation_id',rotationFilter);

  const scheduleQuery=useQuery({
    queryKey:['clinical-schedule',page,search,siteFilter,levelFilter,rotationFilter],
    queryFn:()=>apiFetch<PaginatedResponse<ClinicalScheduleItem>>(`/operational/clinical-schedule?${params}`),
    enabled:hasAccess,
  });
  const optionsQuery=useQuery({
    queryKey:['clinical-schedule-options'],
    queryFn:()=>apiFetch<DashboardOptions>('/operational/clinical-schedule-options'),
    enabled:hasAccess,
  });
  const portalQuery=useQuery({
    queryKey:['student-schedule-portal'],
    queryFn:()=>apiFetch<PortalStatus>('/student-schedule-portal'),
    enabled:hasAccess,
  });
  const togglePortal=useMutation({
    mutationFn:(is_enabled:boolean)=>apiFetch<PortalStatus>('/student-schedule-portal',{method:'PUT',body:{is_enabled}}),
    onSuccess:async(data)=>{setActionError('');setNotice(data.is_enabled?'تم تفعيل رابط الطالب بنجاح.':'تم تعطيل رابط الطالب ومنع الاستعلام فوراً.');await qc.invalidateQueries({queryKey:['student-schedule-portal']});},
    onError:(error)=>{setNotice('');setActionError(error instanceof ApiError?error.message:'تعذر تحديث حالة الرابط.');},
  });

  const copyLink=async()=>{
    const url=`${location.origin}${portalQuery.data?.public_url||'/portal/student-lookup'}`;
    await navigator.clipboard.writeText(url);setNotice('تم نسخ رابط الطالب.');setActionError('');
  };
  const resetFilters=()=>{setSearch('');setSiteFilter('');setLevelFilter('');setRotationFilter('');setPage(1)};
  const options=optionsQuery.data;
  const schedule=scheduleQuery.data;
  const items=schedule?.data??[];
  const portal=portalQuery.data;
  const filteredRotations=useMemo(()=>options?.rotations.filter(rotation=>!levelFilter||rotation.academic_level===levelFilter)??[],[options,levelFilter]);
  const visibleLevels=Object.entries(levels).filter(([value])=>!user?.roles.includes('RTA')||(user.assigned_levels??[]).includes(value));
  const formatDate=(value:string|null|undefined)=>value?new Intl.DateTimeFormat(locale==='ar'?'ar-PS':'en-GB',{day:'numeric',month:'short'}).format(new Date(`${value}T00:00:00`)):'—';

  if(!hasAccess)return <ErrorState title={locale==='ar'?'غير مصرح':'Access denied'} message={locale==='ar'?'تحتاج صلاحية عرض الجدول السريري.':'You need clinical schedule view permission.'}/>;
  if(scheduleQuery.isLoading||optionsQuery.isLoading||portalQuery.isLoading)return <LoadingState/>;
  if(scheduleQuery.isError||optionsQuery.isError||portalQuery.isError)return <ErrorState onRetry={()=>{scheduleQuery.refetch();optionsQuery.refetch();portalQuery.refetch()}}/>;

  return <div className="mx-auto max-w-[1400px] space-y-5 pb-12">
    <PageHeader title={locale==='ar'?'الجدول السريري الإداري':'Administrative Clinical Schedule'} description={locale==='ar'?'مركز متابعة التعيينات المنشورة وإدارة بوابة استعلام الطلبة.':'Monitor published assignments and manage the student lookup portal.'}/>

    {notice&&<div className="flex items-center gap-2 rounded-2xl border border-teal-200 bg-teal-50 p-3 text-xs font-bold text-teal-800"><Check className="h-4 w-4"/>{notice}</div>}
    {actionError&&<div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-800">{actionError}</div>}

    <Card className={`rounded-3xl border p-5 ${portal?.is_enabled?'border-teal-200 bg-teal-50':'border-slate-200 bg-white'}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3"><div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${portal?.is_enabled?'bg-teal-600 text-white':'bg-slate-500 text-white'}`}><ShieldCheck className="h-5 w-5"/></div><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-black">بوابة استعلام الطلبة</h2><span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${portal?.is_enabled?'bg-teal-100 text-teal-700':'bg-slate-100 text-slate-800'}`}>{portal?.is_enabled?'مفعّلة':'متوقفة'}</span></div><p className="mt-1 text-xs leading-5 text-slate-500">الدخول برقم الطالب ثم OTP على البريد الجامعي. عند التعطيل تتوقف جميع جلسات الاستعلام فوراً.</p>{portal?.updated_at&&<p className="mt-1 text-[10px] text-slate-400">آخر تعديل: {new Date(portal.updated_at).toLocaleString(locale==='ar'?'ar-PS':'en-GB')} {portal.updated_by?.name?`· ${portal.updated_by.name}`:''}</p>}</div></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={copyLink}><Copy className="ml-1 h-4 w-4"/>نسخ الرابط</Button><Button variant="outline" onClick={()=>window.open(portal?.public_url||'/portal/student-lookup','_blank','noopener,noreferrer')}><ExternalLink className="ml-1 h-4 w-4"/>فتح الرابط</Button>{canManagePortal?<Button variant={portal?.is_enabled?'danger':'primary'} isLoading={togglePortal.isPending} onClick={()=>togglePortal.mutate(!portal?.is_enabled)}>{portal?.is_enabled?'تعطيل الرابط':'تفعيل الرابط'}</Button>:<span className="flex items-center rounded-xl bg-white/70 px-3 text-[11px] font-bold text-slate-500">التفعيل يحتاج صلاحية من مدير النظام</span>}</div>
      </div>
      <div className="mt-3 flex items-center gap-2 overflow-hidden rounded-xl border border-slate-200/80 bg-white/80 p-3 font-mono text-[11px] text-slate-600"><Link2 className="h-4 w-4 shrink-0"/><span className="truncate" dir="ltr">{location.origin}{portal?.public_url}</span></div>
    </Card>

    <Card className="rounded-3xl border border-slate-100 p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.4fr_.8fr_1fr_1fr_auto]">
        <div className="relative"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={search} onChange={event=>{setSearch(event.target.value);setPage(1)}} placeholder="بحث باسم الطالب أو رقمه..." className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pr-10 pl-3 text-xs outline-none focus:border-teal-500 focus:bg-white"/></div>
        <select value={levelFilter} onChange={event=>{setLevelFilter(event.target.value);setRotationFilter('');setPage(1)}} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs"><option value="">{locale==='ar'?'كل المستويات المعيّنة':'All assigned levels'}</option>{visibleLevels.map(([value,label])=><option key={value} value={value}>{locale==='ar'?label.ar:label.en}</option>)}</select>
        <select value={rotationFilter} onChange={event=>{setRotationFilter(event.target.value);setPage(1)}} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs"><option value="">كل المساقات المنشورة</option>{filteredRotations.map(rotation=><option key={rotation.id} value={rotation.id}>{rotation.code} — {rotation.name} ({rotation.academic_year})</option>)}</select>
        <select value={siteFilter} onChange={event=>{setSiteFilter(event.target.value);setPage(1)}} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs"><option value="">كل المستشفيات</option>{options?.sites.map(site=><option key={site.id} value={site.id}>{locale==='ar'?site.name_ar:site.name_en||site.name_ar}</option>)}</select>
        <Button variant="outline" onClick={resetFilters}><FilterX className="ml-1 h-4 w-4"/>مسح</Button>
      </div>
    </Card>

    {!items.length?<EmptyState title="لا توجد نتائج" message="لا توجد تعيينات منشورة تطابق الفلاتر. تأكد من توزيع مجموعة طلاب داخل خلية أسبوعية ثم نشر النسخة."/>:<>
      <div className="grid gap-3 md:hidden">{items.map(item=><Card key={item.assignment_id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start justify-between"><div><h3 className="font-black">{item.student?.full_name_ar}</h3><p className="mt-1 font-mono text-[11px] text-slate-400">{item.student?.university_number}</p></div><span className="rounded-lg bg-teal-50 px-2 py-1 text-[11px] font-black text-teal-700">{item.block?.block_code||'—'}</span></div><div className="mt-4 grid grid-cols-2 gap-2 text-[11px]"><div className="rounded-xl bg-slate-50 p-3"><span className="text-slate-400">المساق</span><p className="mt-1 font-bold">{item.course?.name_ar||item.rotation?.name||'—'}</p></div><div className="rounded-xl bg-slate-50 p-3"><span className="text-slate-400">المجموعة</span><p className="mt-1 font-bold">{item.group?.name||'—'} / {item.subgroup?.name||'—'}</p></div><div className="rounded-xl bg-slate-50 p-3"><span className="text-slate-400">المستشفى</span><p className="mt-1 font-bold">{item.training_site?.name_ar||'—'}</p></div><div className="rounded-xl bg-slate-50 p-3"><span className="text-slate-400">الطبيب</span><p className="mt-1 font-bold">{item.supervisor?.full_name_ar||'شاغر'}</p></div></div></Card>)}</div>
      <div className="hidden overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm md:block"><div className="overflow-x-auto"><table className="w-full text-right"><thead><tr className="border-b border-slate-100 bg-slate-50 text-[11px] font-bold text-slate-500"><th className="px-5 py-4">الطالب</th><th className="px-5 py-4">المساق</th><th className="px-5 py-4">المجموعة</th><th className="px-5 py-4">الفترة</th><th className="px-5 py-4">المستشفى</th><th className="px-5 py-4">الطبيب</th></tr></thead><tbody className="divide-y divide-slate-100">{items.map(item=><tr key={item.assignment_id} className="hover:bg-slate-50"><td className="px-5 py-4"><p className="text-xs font-black">{locale==='ar'?item.student?.full_name_ar:item.student?.full_name_en||item.student?.full_name_ar}</p><p className="mt-1 font-mono text-[10px] text-slate-400">{item.student?.university_number}</p></td><td className="px-5 py-4"><p className="text-xs font-bold">{locale==='ar'?item.course?.name_ar:item.course?.name_en||item.course?.name_ar||item.rotation?.name}</p><p className="mt-1 text-[10px] text-teal-600">{item.course?.code||item.rotation?.code}</p></td><td className="px-5 py-4 text-xs font-bold">{item.group?.name||'—'} <span className="text-slate-400">/ {item.subgroup?.name||'—'}</span></td><td className="px-5 py-4"><span className="rounded-lg bg-teal-50 px-2 py-1 text-[11px] font-black text-teal-700">{item.block?.block_code||'—'}</span><p className="mt-1 text-[10px] text-slate-400">{formatDate(item.block?.start_date)} — {formatDate(item.block?.end_date)}</p></td><td className="px-5 py-4 text-xs font-bold text-slate-700">{locale==='ar'?item.training_site?.name_ar:item.training_site?.name_en||item.training_site?.name_ar||'—'}</td><td className="px-5 py-4 text-xs font-bold text-slate-700">{locale==='ar'?item.supervisor?.full_name_ar:item.supervisor?.full_name_en||item.supervisor?.full_name_ar||'شاغر'}</td></tr>)}</tbody></table></div></div>
      <div className="flex flex-col items-center justify-between gap-3 rounded-2xl bg-white p-3 sm:flex-row"><p className="text-[11px] text-slate-500">عرض {schedule?.from??0}–{schedule?.to??0} من {schedule?.total??0} تعيين</p><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={!schedule?.prev_page_url} onClick={()=>setPage(value=>Math.max(1,value-1))}><ChevronRight className="h-4 w-4"/>السابق</Button><span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-black">{schedule?.current_page} / {schedule?.last_page}</span><Button variant="outline" size="sm" disabled={!schedule?.next_page_url} onClick={()=>setPage(value=>value+1)}>التالي<ChevronLeft className="h-4 w-4"/></Button></div></div>
    </>}
  </div>;
}
