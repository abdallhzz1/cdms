import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { CalendarDays, Download, Eye, FileText } from 'lucide-react';
import { apiFetch, apiUrl } from '@/api/client';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import logo from '@/assets/hebron.png';

type PublicRepository={title:string;allow_download:boolean;meetings:{id:number;minutes_number:string;meeting_type:string;meeting_date:string;agenda?:string|null;discussion_summary?:string|null;decisions_summary?:string|null}[];files:{id:number;original_name:string;mime_type:string;file_size:number}[]};

export function PublicMeetingRepositoryPage(){
  const {token}=useParams();
  const query=useQuery({queryKey:['public-meeting-repository',token],queryFn:()=>apiFetch<PublicRepository>(`/public/meeting-repositories/${token}`),enabled:Boolean(token),retry:false});
  if(query.isLoading)return <LoadingState/>;
  if(query.isError||!query.data)return <div dir="rtl" className="mx-auto max-w-xl p-6"><ErrorState title="الرابط غير متاح" message="تم إيقاف مشاركة هذا المستودع أو أن الرابط غير صحيح."/></div>;
  const repo=query.data;

  return <div className="min-h-screen bg-slate-50" dir="rtl">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-4"><img src={logo} alt="جامعة الخليل" className="h-14 w-14 object-contain"/><div><p className="text-[10px] font-black text-teal-700">جامعة الخليل · كلية الطب</p><h1 className="mt-1 text-lg font-black text-slate-900">{repo.title}</h1></div></div></header>
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      {repo.meetings.length>0&&<section><h2 className="mb-3 text-sm font-black text-slate-900">محاضر الاجتماعات ({repo.meetings.length})</h2><div className="space-y-3">{repo.meetings.map(meeting=><article key={meeting.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-black text-slate-900">{meeting.meeting_type}</h3><span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500"><CalendarDays className="h-3.5 w-3.5"/>{meeting.meeting_date.slice(0,10)} · {meeting.minutes_number}</span></div><div className="mt-4 grid gap-3 md:grid-cols-3"><MinuteField title="جدول الأعمال" value={meeting.agenda}/><MinuteField title="ملخص النقاش" value={meeting.discussion_summary}/><MinuteField title="خلاصة القرارات" value={meeting.decisions_summary}/></div></article>)}</div></section>}
      <section><h2 className="mb-3 text-sm font-black text-slate-900">الملفات المرفقة ({repo.files.length})</h2><div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">{repo.files.length===0?<p className="p-6 text-center text-xs font-bold text-slate-500">لا توجد ملفات مرفقة.</p>:<div className="divide-y divide-slate-100">{repo.files.map(file=>{const previewable=file.mime_type==='application/pdf'||file.mime_type.startsWith('image/');return <div key={file.id} className="flex items-center justify-between gap-3 p-4"><div className="flex min-w-0 items-center gap-3"><span className="rounded-lg bg-slate-100 p-2"><FileText className="h-5 w-5 text-slate-500"/></span><div className="min-w-0"><p className="truncate text-xs font-black text-slate-800">{file.original_name}</p><p className="mt-1 text-[10px] text-slate-400">{formatBytes(file.file_size)}</p></div></div><div className="flex shrink-0 gap-2">{previewable&&<a href={apiUrl(`/public/meeting-repositories/${token}/files/${file.id}`)} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"><Eye className="me-2 h-4 w-4"/>عرض</a>}{repo.allow_download&&<a href={`${apiUrl(`/public/meeting-repositories/${token}/files/${file.id}`)}?download=1`} className="inline-flex h-9 items-center rounded-lg bg-teal-600 px-3 text-xs font-bold text-white hover:bg-teal-700"><Download className="me-2 h-4 w-4"/>تنزيل</a>}{!previewable&&!repo.allow_download&&<span className="text-[10px] font-bold text-slate-400">التنزيل غير متاح</span>}</div></div>})}</div>}</div></section>
    </main>
  </div>;
}

function MinuteField({title,value}:{title:string;value?:string|null}){return <div className="rounded-xl bg-slate-50 p-3"><h4 className="text-[11px] font-black text-teal-800">{title}</h4><p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-slate-700">{value||'—'}</p></div>}
function formatBytes(value:number){if(value<1024)return `${value} بايت`;if(value<1024*1024)return `${Math.round(value/1024)} ك.ب`;return `${(value/1024/1024).toFixed(1)} م.ب`}
