import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BarChart3, BookOpenCheck, Building2, CheckCircle2, ClipboardCheck, Download, FileSpreadsheet, Filter, GraduationCap, Loader2, Search, ShieldCheck, Stethoscope, Users } from 'lucide-react';
import { apiFetch, apiUrl } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';

type Category = 'all' | 'academic' | 'clinical' | 'quality' | 'monitoring';
type ReportDefinition = { key:string; category:Exclude<Category,'all'>; title:string; description:string };
type SummaryPayload = {
  academic_years:Array<{id:number;code:string;is_current:boolean;status:string}>;
  metrics:{students:number;academically_registered:number;students_in_groups:number;students_in_published_schedule:number;active_supervisors:number;vacant_schedule_rows:number;course_reports_pending_approval:number};
  reports:ReportDefinition[];
  generated_at:string;
};
type PreviewPayload = { definition:ReportDefinition; columns:string[]; rows:Array<Array<string|number|null>>; total:number; preview_limit:number };

const categories:Array<{id:Category;label:string}> = [
  {id:'all',label:'جميع التقارير'}, {id:'academic',label:'أكاديمية'}, {id:'clinical',label:'سريرية'}, {id:'quality',label:'الجودة'}, {id:'monitoring',label:'رقابية'},
];
const reportIcons:Record<string,typeof Users> = {
  student_directory:Users, group_rosters:GraduationCap, clinical_schedule:Stethoscope,
  supervisors_hospitals:Building2, grades:BookOpenCheck, attendance:CheckCircle2,
  clinical_assessments:ClipboardCheck, course_reports:FileSpreadsheet, quality_plans:BarChart3,
  data_gaps:AlertTriangle,
};

export function ReportsDashboard() {
  const { can } = useAuth();
  const [category,setCategory] = useState<Category>('all');
  const [yearId,setYearId] = useState('');
  const [level,setLevel] = useState('');
  const [selectedKey,setSelectedKey] = useState('data_gaps');
  const [searchInput,setSearchInput] = useState('');
  const [search,setSearch] = useState('');
  const [downloadKey,setDownloadKey] = useState('');
  const [downloadError,setDownloadError] = useState('');
  const initializedCurrentYear=useRef(false);

  useEffect(()=>{const timer=window.setTimeout(()=>setSearch(searchInput.trim()),300);return()=>window.clearTimeout(timer)},[searchInput]);
  const baseParams=useMemo(()=>{const p=new URLSearchParams();if(yearId)p.set('academic_year_id',yearId);if(level)p.set('academic_level',level);return p},[level,yearId]);
  const summaryQuery=useQuery({queryKey:['report-center-summary',yearId,level],queryFn:()=>apiFetch<SummaryPayload>(`/report-center/summary?${baseParams}`),enabled:can('reports.view')});
  const previewParams=useMemo(()=>{const p=new URLSearchParams(baseParams);if(search)p.set('search',search);return p},[baseParams,search]);
  const previewQuery=useQuery({queryKey:['report-center-preview',selectedKey,yearId,level,search],queryFn:()=>apiFetch<PreviewPayload>(`/report-center/${selectedKey}/preview?${previewParams}`),enabled:can('reports.view')&&Boolean(selectedKey)});

  useEffect(()=>{if(!initializedCurrentYear.current&&summaryQuery.data?.academic_years.length){initializedCurrentYear.current=true;const current=summaryQuery.data.academic_years.find(y=>y.is_current);if(current)setYearId(String(current.id))}},[summaryQuery.data]);

  if(!can('reports.view'))return <ErrorState title="لا تملك صلاحية عرض التقارير" message="اطلب صلاحية عرض التقارير من مدير النظام."/>;
  if(summaryQuery.isLoading)return <LoadingState/>;
  if(summaryQuery.isError||!summaryQuery.data)return <ErrorState title="تعذر تحميل مركز التقارير" onRetry={()=>summaryQuery.refetch()}/>;

  const summary=summaryQuery.data;
  const filtered=category==='all'?summary.reports:summary.reports.filter(r=>r.category===category);
  const metrics=summary.metrics;
  const ungrouped=Math.max(0,metrics.academically_registered-metrics.students_in_groups);
  const unscheduled=Math.max(0,metrics.students_in_groups-metrics.students_in_published_schedule);

  const download=async(format:'xlsx'|'pdf')=>{
    const key=`${selectedKey}-${format}`;setDownloadKey(key);setDownloadError('');
    try{
      const params=new URLSearchParams(previewParams);params.set('format',format);
      const response=await fetch(apiUrl(`/report-center/${selectedKey}/export?${params}`),{credentials:'include',headers:{Accept:format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});
      if(!response.ok){const body=await response.json().catch(()=>null);throw new Error(body?.message||'تعذر إنشاء ملف التقرير.');}
      const blob=await response.blob();const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;
      const disposition=response.headers.get('content-disposition')||'';const utf=disposition.match(/filename\*=UTF-8''([^;]+)/i);const plain=disposition.match(/filename="?([^";]+)"?/i);
      link.download=utf?decodeURIComponent(utf[1]):plain?.[1]||`${selectedKey}-${new Date().toISOString().slice(0,10)}.${format}`;
      document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
    }catch(error){setDownloadError(error instanceof Error?error.message:'تعذر تنزيل التقرير.');}finally{setDownloadKey('');}
  };

  return <div className="space-y-5 pb-20">
    <PageHeader title="مركز التقارير التشغيلية" description="تقارير موحدة قابلة للمعاينة والتصفية والتصدير بهوية جامعة الخليل والدائرة السريرية."/>

    <section className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_13rem_13rem]">
      <div className="flex items-center gap-2 text-xs font-bold text-slate-600"><Filter className="h-4 w-4 text-teal-600"/>تُطبّق الفلاتر على المؤشرات والمعاينة والملف المصدر.</div>
      <select value={yearId} onChange={e=>setYearId(e.target.value)} className="input"><option value="">جميع الأعوام</option>{summary.academic_years.map(y=><option key={y.id} value={y.id}>{y.code}{y.is_current?' - الحالي':''}</option>)}</select>
      <select value={level} onChange={e=>setLevel(e.target.value)} className="input"><option value="">جميع السنوات السريرية</option><option value="fourth">السنة الرابعة</option><option value="fifth">السنة الخامسة</option><option value="sixth">السنة السادسة</option></select>
    </section>

    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Metric label="الطلبة المسجلون أكاديمياً" value={metrics.academically_registered} note={`من أصل ${metrics.students} طالب`} icon={Users}/>
      <Metric label="طلبة داخل المجموعات" value={metrics.students_in_groups} note={ungrouped?`${ungrouped} بحاجة لمجموعة`:'لا توجد فجوة ظاهرة'} icon={GraduationCap}/>
      <Metric label="طلبة في جدول منشور" value={metrics.students_in_published_schedule} note={unscheduled?`${unscheduled} لم يظهروا في جدول منشور`:'التغطية مكتملة'} icon={Stethoscope}/>
      <Metric label="المشرفون النشطون" value={metrics.active_supervisors} note={`${metrics.vacant_schedule_rows} صف شاغر · ${metrics.course_reports_pending_approval} تقرير بانتظار الاعتماد`} icon={ShieldCheck}/>
    </section>

    {(ungrouped>0||unscheduled>0||metrics.vacant_schedule_rows>0||metrics.course_reports_pending_approval>0)&&<section className="flex flex-col gap-3 rounded-3xl border border-teal-200 bg-teal-50/70 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="flex items-center gap-2 text-sm font-black text-teal-900"><AlertTriangle className="h-4 w-4"/>متابعة تشغيلية مطلوبة</h2><p className="mt-1 text-xs leading-6 text-teal-800">تقرير نواقص البيانات يجمع الحالات التي تحتاج متابعة قبل اعتماد الجداول أو التقارير.</p></div><Button variant="outline" onClick={()=>{setSelectedKey('data_gaps');setCategory('monitoring');document.getElementById('report-preview')?.scrollIntoView({behavior:'smooth'})}}>فتح تقرير النواقص</Button></section>}

    <section className="rounded-3xl border border-slate-200 bg-white p-2 shadow-sm"><div className="flex gap-1 overflow-x-auto">{categories.map(item=><button key={item.id} onClick={()=>setCategory(item.id)} className={`shrink-0 rounded-xl px-4 py-2.5 text-xs font-bold transition ${category===item.id?'bg-teal-600 text-white shadow-sm':'text-slate-600 hover:bg-teal-50'}`}>{item.label}</button>)}</div></section>

    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{filtered.map(report=>{const Icon=reportIcons[report.key]||FileSpreadsheet;const active=selectedKey===report.key;return <button key={report.key} onClick={()=>setSelectedKey(report.key)} className={`group rounded-3xl border p-4 text-right shadow-sm transition ${active?'border-teal-300 bg-teal-50/70 ring-2 ring-teal-100':'border-slate-200 bg-white hover:border-teal-200 hover:shadow-md'}`}><div className="flex items-start gap-3"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${active?'bg-teal-600 text-white':'bg-teal-50 text-teal-700'}`}><Icon className="h-5 w-5"/></span><span className="min-w-0"><span className="block text-sm font-black text-slate-800">{report.title}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{report.description}</span></span></div></button>})}</section>

    <section id="report-preview" className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/70 p-4 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="text-sm font-black text-slate-800">{previewQuery.data?.definition.title||'معاينة التقرير'}</h2><p className="mt-1 text-xs text-slate-500">تظهر أول 20 نتيجة في المعاينة، بينما يحتوي الملف المصدر على جميع النتائج المطابقة.</p></div><div className="flex flex-col gap-2 sm:flex-row"><label className="flex h-10 min-w-64 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3"><Search className="h-4 w-4 text-slate-400"/><input value={searchInput} onChange={e=>setSearchInput(e.target.value)} className="w-full bg-transparent text-xs font-bold outline-none" placeholder="بحث داخل التقرير..."/></label>{can('reports.export')&&<><Button variant="outline" disabled={Boolean(downloadKey)||previewQuery.isLoading} onClick={()=>download('xlsx')}>{downloadKey.endsWith('xlsx')?<Loader2 className="ml-1 h-4 w-4 animate-spin"/>:<FileSpreadsheet className="ml-1 h-4 w-4"/>}Excel</Button><Button disabled={Boolean(downloadKey)||previewQuery.isLoading} onClick={()=>download('pdf')}>{downloadKey.endsWith('pdf')?<Loader2 className="ml-1 h-4 w-4 animate-spin"/>:<Download className="ml-1 h-4 w-4"/>}PDF</Button></>}</div></div>
      {downloadError&&<div className="border-b border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">{downloadError}</div>}
      {previewQuery.isLoading?<div className="flex min-h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-teal-600"/></div>:previewQuery.isError?<div className="p-6"><ErrorState title="تعذر تحميل معاينة التقرير" onRetry={()=>previewQuery.refetch()}/></div>:previewQuery.data&&!previewQuery.data.rows.length?<div className="p-12 text-center"><FileSpreadsheet className="mx-auto h-9 w-9 text-slate-300"/><p className="mt-3 text-sm font-black text-slate-700">لا توجد بيانات مطابقة</p><p className="mt-1 text-xs text-slate-500">غيّر العام أو السنة السريرية أو عبارة البحث.</p></div>:previewQuery.data&&<><div className="overflow-x-auto"><table className="w-full min-w-max text-right text-xs"><thead><tr className="border-b border-slate-200 bg-slate-50 text-slate-500">{previewQuery.data.columns.map(column=><th key={column} className="whitespace-nowrap px-4 py-3 font-bold">{column}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{previewQuery.data.rows.map((row,index)=><tr key={index} className="hover:bg-teal-50/30">{row.map((value,cell)=><td key={cell} className="max-w-72 px-4 py-3 align-top text-slate-700">{value===null||value===''?'—':String(value)}</td>)}</tr>)}</tbody></table></div><div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">إجمالي النتائج: <strong className="text-teal-700">{previewQuery.data.total}</strong>{previewQuery.data.total>previewQuery.data.preview_limit&&' · صدّر الملف لعرض جميع النتائج'}</div></>}
    </section>
  </div>;
}

function Metric({label,value,note,icon:Icon}:{label:string;value:number;note:string;icon:typeof Users}){return <article className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-bold text-slate-500">{label}</p><p className="mt-2 text-2xl font-black text-slate-900">{value}</p></div><span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-teal-50 text-teal-700"><Icon className="h-4 w-4"/></span></div><p className="mt-2 text-[10px] leading-5 text-slate-500">{note}</p></article>}
