import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BarChart3, BookOpenCheck, Building2, CheckCircle2, ClipboardCheck, Download, FileSpreadsheet, GraduationCap, Loader2, RefreshCw, Search, Stethoscope, Users, X } from 'lucide-react';
import { apiFetch, apiUrl } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';

type Category = 'academic' | 'clinical' | 'quality' | 'monitoring';
type ReportDefinition = { key:string; category:Category; title:string; description:string };
type SummaryPayload = {
  academic_years:Array<{id:number;code:string;is_current:boolean;status:string}>;
  clinical_periods?:Array<{id:number;academic_year_id:number;code:string;name_ar:string;name_en:string|null;sequence:number}>;
  metrics:{students:number;academically_registered:number;students_in_groups:number;students_in_published_schedule:number;active_supervisors:number;vacant_schedule_rows:number;course_reports_pending_approval:number};
  reports:ReportDefinition[];
  generated_at:string;
};
type PreviewPayload = { definition:ReportDefinition; columns:string[]; rows:Array<Array<string|number|null>>; total:number; preview_limit:number };

const reportCopy: Record<string, { ar: string; en: string; descriptionAr: string; descriptionEn: string }> = {
  student_directory: { ar: 'دليل الطلبة الأكاديمي', en: 'Academic student directory', descriptionAr: 'قائمة الطلبة حسب السنة والحالة الأكاديمية والمجموعة الرئيسية.', descriptionEn: 'Students by year, academic status, and main group.' },
  group_rosters: { ar: 'قوائم مجموعات الطلبة', en: 'Student group rosters', descriptionAr: 'كشف الطلبة المسجلين في المجموعات الرئيسية لكل عام وسنة سريرية.', descriptionEn: 'Students registered in main groups for each academic and clinical year.' },
  clinical_schedule: { ar: 'الجدول السريري المنشور', en: 'Published clinical schedule', descriptionAr: 'أماكن دوام الطلبة والمجموعات والمستشفيات والأطباء في الجداول المنشورة.', descriptionEn: 'Student, group, hospital, and physician placements in published schedules.' },
  supervisors_hospitals: { ar: 'المستشفيات والمشرفون', en: 'Hospitals and supervisors', descriptionAr: 'دليل المشرفين السريريين والمستشفيات المرتبطين بها وحالة الحساب.', descriptionEn: 'Clinical supervisors, their linked hospitals, and account status.' },
  grades: { ar: 'علامات المساقات السريرية', en: 'Clinical course grades', descriptionAr: 'العلامة السريرية والأوسكي والامتحان الكتابي وحالة الاعتماد.', descriptionEn: 'Clinical, OSCE, and written scores with approval status.' },
  attendance: { ar: 'الحضور والغياب', en: 'Attendance', descriptionAr: 'سجل حضور الطلبة للجلسات السريرية مع الملاحظات والأعذار.', descriptionEn: 'Student attendance in clinical sessions with notes and excuses.' },
  clinical_assessments: { ar: 'التقييمات السريرية', en: 'Clinical assessments', descriptionAr: 'تقييمات الطلبة ودرجاتها والمشرف الذي قام بالتقييم وحالة الإرسال.', descriptionEn: 'Student assessments, scores, assessor, and submission status.' },
  course_reports: { ar: 'متابعة تقارير المساقات', en: 'Course report tracking', descriptionAr: 'حالة التقارير السنوية للمساقات: مسودة أو مرسلة أو معتمدة أو معادة.', descriptionEn: 'Annual course report status: draft, submitted, approved, or returned.' },
  quality_plans: { ar: 'خطط التحسين والجودة', en: 'Quality and improvement plans', descriptionAr: 'متابعة ملاحظات الجودة وإجراءات التحسين والمسؤوليات والمواعيد.', descriptionEn: 'Quality findings, improvement actions, owners, and due dates.' },
  data_gaps: { ar: 'نواقص البيانات والتشغيل', en: 'Data and operational gaps', descriptionAr: 'تقرير رقابي يجمع الطلبة دون مجموعات أو توزيع، والمشرفين دون مستشفيات، والتكليفات دون طبيب.', descriptionEn: 'Students without groups or placements, supervisors without hospitals, and assignments without physicians.' },
};

const categories:Array<{id:Category;ar:string;en:string}> = [
  {id:'academic',ar:'التقارير الأكاديمية',en:'Academic reports'}, {id:'clinical',ar:'التقارير السريرية',en:'Clinical reports'}, {id:'quality',ar:'تقارير الجودة',en:'Quality reports'}, {id:'monitoring',ar:'التقارير الرقابية',en:'Monitoring reports'},
];
const reportIcons:Record<string,typeof Users> = {
  student_directory:Users, group_rosters:GraduationCap, clinical_schedule:Stethoscope,
  supervisors_hospitals:Building2, grades:BookOpenCheck, attendance:CheckCircle2,
  clinical_assessments:ClipboardCheck, course_reports:FileSpreadsheet, quality_plans:BarChart3,
  data_gaps:AlertTriangle,
};

export function ReportsDashboard() {
  const { can } = useAuth();
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const tr = (arabic:string, english:string) => ar ? arabic : english;
  const [yearId,setYearId] = useState('');
  const [level,setLevel] = useState('');
  const [periodId,setPeriodId] = useState('');
  const [selectedKey,setSelectedKey] = useState('data_gaps');
  const [searchInput,setSearchInput] = useState('');
  const [search,setSearch] = useState('');
  const [downloadKey,setDownloadKey] = useState('');
  const [downloadError,setDownloadError] = useState('');
  const initializedCurrentYear=useRef(false);

  useEffect(()=>{const timer=window.setTimeout(()=>setSearch(searchInput.trim()),300);return()=>window.clearTimeout(timer)},[searchInput]);
  const baseParams=useMemo(()=>{const p=new URLSearchParams();if(yearId)p.set('academic_year_id',yearId);if(periodId)p.set('clinical_period_id',periodId);if(level)p.set('academic_level',level);return p},[level,periodId,yearId]);
  const summaryQuery=useQuery({queryKey:['report-center-summary',yearId,periodId,level],queryFn:()=>apiFetch<SummaryPayload>(`/report-center/summary?${baseParams}`),enabled:can('reports.view')});
  const previewParams=useMemo(()=>{const p=new URLSearchParams(baseParams);if(search)p.set('search',search);return p},[baseParams,search]);
  const previewQuery=useQuery({queryKey:['report-center-preview',selectedKey,yearId,periodId,level,search],queryFn:()=>apiFetch<PreviewPayload>(`/report-center/${selectedKey}/preview?${previewParams}`),enabled:can('reports.view')&&Boolean(selectedKey)});

  useEffect(()=>{if(!initializedCurrentYear.current&&summaryQuery.data?.academic_years.length){initializedCurrentYear.current=true;const current=summaryQuery.data.academic_years.find(y=>y.is_current);if(current)setYearId(String(current.id))}},[summaryQuery.data]);

  if(!can('reports.view'))return <ErrorState title={tr('لا تملك صلاحية عرض التقارير', 'You do not have permission to view reports')} message={tr('اطلب صلاحية عرض التقارير من مدير النظام.', 'Request the reports permission from the system administrator.')}/>;
  if(summaryQuery.isLoading)return <LoadingState/>;
  if(summaryQuery.isError||!summaryQuery.data)return <ErrorState title={tr('تعذر تحميل مركز التقارير', 'Could not load the report center')} onRetry={()=>summaryQuery.refetch()}/>;

  const summary=summaryQuery.data;
  const visiblePeriods=(summary.clinical_periods??[]).filter(period=>!yearId||String(period.academic_year_id)===yearId);
  const reportLabel = (report: ReportDefinition) => {
    const copy = reportCopy[report.key];
    return { title: copy ? (ar ? copy.ar : copy.en) : report.title, description: copy ? (ar ? copy.descriptionAr : copy.descriptionEn) : report.description };
  };
  const selectedReport=summary.reports.find(report=>report.key===selectedKey)??summary.reports[0];
  const selectedCopy=selectedReport?reportLabel(selectedReport):null;
  const activeFilterCount=[yearId,periodId,level].filter(Boolean).length;
  const resetFilters=()=>{setYearId('');setPeriodId('');setLevel('');setSearchInput('');setSearch('')};

  const download=async(format:'xlsx'|'pdf')=>{
    const key=`${selectedKey}-${format}`;setDownloadKey(key);setDownloadError('');
    try{
      const params=new URLSearchParams(previewParams);params.set('format',format);
      const response=await fetch(apiUrl(`/report-center/${selectedKey}/export?${params}`),{credentials:'include',headers:{Accept:format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});
      if(!response.ok){const body=await response.json().catch(()=>null);throw new Error(body?.message||tr('تعذر إنشاء ملف التقرير.', 'Could not create the report file.'));}
      const blob=await response.blob();const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;
      const disposition=response.headers.get('content-disposition')||'';const utf=disposition.match(/filename\*=UTF-8''([^;]+)/i);const plain=disposition.match(/filename="?([^";]+)"?/i);
      link.download=utf?decodeURIComponent(utf[1]):plain?.[1]||`${selectedKey}-${new Date().toISOString().slice(0,10)}.${format}`;
      document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
    }catch(error){setDownloadError(error instanceof Error?error.message:tr('تعذر تنزيل التقرير.', 'Could not download the report.'));}finally{setDownloadKey('');}
  };

  return <div className="space-y-4 pb-20">
    <PageHeader title={tr('التقارير السنوية والإحصائيات', 'Annual reports and statistics')} description={tr('صورة موحدة عن العمل الأكاديمي والسريري، مع تقارير جاهزة للمعاينة والتصدير.', 'A unified view of academic and clinical operations with ready-to-export reports.')}/>

    <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:grid-cols-2 xl:grid-cols-[1.35fr_1fr_1fr_1fr_auto] xl:items-end">
      <FilterField label={tr('التقرير','Report')}><select value={selectedKey} onChange={e=>{setSelectedKey(e.target.value);setSearchInput('');setSearch('')}} className="input">{categories.map(group=><optgroup key={group.id} label={ar?group.ar:group.en}>{summary.reports.filter(report=>report.category===group.id).map(report=><option key={report.key} value={report.key}>{reportLabel(report).title}</option>)}</optgroup>)}</select></FilterField>
        <FilterField label={tr('العام الأكاديمي','Academic year')}><select value={yearId} onChange={e=>{setYearId(e.target.value);setPeriodId('')}} className="input"><option value="">{tr('جميع الأعوام', 'All years')}</option>{summary.academic_years.map(y=><option key={y.id} value={y.id}>{y.code}{y.is_current?tr(' — الحالي',' — Current'):''}</option>)}</select></FilterField>
        <FilterField label={tr('الفترة السريرية','Clinical period')}><select value={periodId} onChange={e=>setPeriodId(e.target.value)} disabled={!visiblePeriods.length} className="input disabled:bg-slate-50 disabled:text-slate-400"><option value="">{tr('جميع الفترات','All periods')}</option>{visiblePeriods.map(period=><option key={period.id} value={period.id}>{period.code} — {ar?period.name_ar:period.name_en||period.name_ar}</option>)}</select></FilterField>
        <FilterField label={tr('السنة السريرية','Clinical year')}><select value={level} onChange={e=>setLevel(e.target.value)} className="input"><option value="">{tr('جميع السنوات', 'All years')}</option><option value="fourth">{tr('السنة الرابعة','Fourth year')}</option><option value="fifth">{tr('السنة الخامسة','Fifth year')}</option><option value="sixth">{tr('السنة السادسة','Sixth year')}</option></select></FilterField>
      <button onClick={resetFilters} disabled={!activeFilterCount&&!searchInput} className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-500 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 disabled:cursor-default disabled:opacity-40"><X className="h-4 w-4"/>{tr('مسح','Clear')}</button>
    </section>
    <section id="report-preview" className="min-w-0 overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50/60 p-4"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="flex min-w-0 items-start gap-3">{selectedReport&&(()=>{const Icon=reportIcons[selectedReport.key]||FileSpreadsheet;return <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-600 text-white"><Icon className="h-5 w-5"/></span>})()}<div className="min-w-0"><h2 className="text-base font-black text-slate-900">{selectedCopy?.title??tr('معاينة التقرير','Report preview')}</h2><p className="mt-1 max-w-2xl text-[11px] leading-5 text-slate-500">{selectedCopy?.description}</p></div></div><div className="flex shrink-0 flex-wrap gap-2">{can('reports.export')&&<><Button variant="outline" disabled={Boolean(downloadKey)||previewQuery.isLoading} onClick={()=>download('xlsx')}>{downloadKey.endsWith('xlsx')?<Loader2 className="ms-1 h-4 w-4 animate-spin"/>:<FileSpreadsheet className="ms-1 h-4 w-4"/>}Excel</Button><Button disabled={Boolean(downloadKey)||previewQuery.isLoading} onClick={()=>download('pdf')}>{downloadKey.endsWith('pdf')?<Loader2 className="ms-1 h-4 w-4 animate-spin"/>:<Download className="ms-1 h-4 w-4"/>}PDF</Button></>}</div></div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><label className="flex h-10 w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 sm:max-w-sm"><Search className="h-4 w-4 text-slate-400"/><input value={searchInput} onChange={e=>setSearchInput(e.target.value)} className="w-full bg-transparent text-xs font-bold outline-none" placeholder={tr('بحث في نتائج هذا التقرير...','Search this report...')}/>{searchInput&&<button onClick={()=>setSearchInput('')} aria-label={tr('مسح البحث','Clear search')}><X className="h-4 w-4 text-slate-400"/></button>}</label><div className="flex items-center gap-2 text-[10px] text-slate-400"><RefreshCw className="h-3.5 w-3.5"/>{tr('آخر تحديث:','Last updated:')} {new Date(summary.generated_at).toLocaleString(locale==='ar'?'ar-PS':'en-GB',{dateStyle:'short',timeStyle:'short'})}</div></div>
      </div>
      {downloadError&&<div className="border-b border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">{downloadError}</div>}
      {previewQuery.isLoading?<div className="flex min-h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-teal-600"/></div>:previewQuery.isError?<div className="p-6"><ErrorState title={tr('تعذر تحميل معاينة التقرير','Could not load report preview')} onRetry={()=>previewQuery.refetch()}/></div>:previewQuery.data&&!previewQuery.data.rows.length?<div className="p-12 text-center"><FileSpreadsheet className="mx-auto h-9 w-9 text-slate-300"/><p className="mt-3 text-sm font-black text-slate-700">{tr('لا توجد بيانات مطابقة','No matching data')}</p><p className="mt-1 text-xs text-slate-500">{tr('غيّر العام أو السنة السريرية أو عبارة البحث.','Change the academic year, clinical year, or search term.')}</p></div>:previewQuery.data&&<><div className="overflow-x-auto"><table className="w-full min-w-max text-start text-xs"><thead><tr className="border-b border-slate-200 bg-slate-50 text-slate-500">{previewQuery.data.columns.map(column=><th key={column} className="whitespace-nowrap px-4 py-3 font-bold">{column}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{previewQuery.data.rows.map((row,index)=><tr key={index} className="hover:bg-teal-50/30">{row.map((value,cell)=><td key={cell} className="max-w-72 px-4 py-3 align-top text-slate-700">{value===null||value===''?'—':String(value)}</td>)}</tr>)}</tbody></table></div><div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">{tr('إجمالي النتائج:','Total results:')} <strong className="text-teal-700">{previewQuery.data.total}</strong>{previewQuery.data.total>previewQuery.data.preview_limit&&tr(' · صدّر الملف لعرض جميع النتائج',' · Export the file to view all results')}</div></>}
    </section>
  </div>;
}

function FilterField({label,children}:{label:string;children:React.ReactNode}){return <label className="space-y-1.5"><span className="block text-[11px] font-bold text-slate-500">{label}</span>{children}</label>}
