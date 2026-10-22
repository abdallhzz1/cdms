import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, BookOpenCheck, Copy, Download, FileUp, QrCode, Search, Send, Trash2, XCircle } from 'lucide-react';
import QRCode from 'qrcode';
import { bulkRecordPaperReceipt, closePolicyCampaign, deletePolicyCampaign, downloadPrivateFile, getPolicyCampaign, publishPolicyCampaign, recordPaperReceipt, uploadPolicyScan, type CampaignDetails, type PolicyAssignment } from '@/api/studentPolicies';
import { useAuth } from '@/auth/AuthContext';
import { LoadingState } from '@/components/ui/LoadingState';
import { Modal } from '@/components/ui/Modal';

const levelLabel: Record<string,string> = { fourth: 'الرابعة', fifth: 'الخامسة', sixth: 'السادسة' };

export function StudentPolicyCampaignPage() {
  const { id = '' } = useParams(); const navigate = useNavigate(); const { can } = useAuth(); const manage = can('student_policies.manage'); const qc = useQueryClient();
  const [search, setSearch] = useState(''); const [level, setLevel] = useState(''); const [status, setStatus] = useState(''); const [page, setPage] = useState(1); const [selected, setSelected] = useState<number[]>([]); const [notice, setNotice] = useState(''); const [noticeError, setNoticeError] = useState(false); const [qrOpen, setQrOpen] = useState(false); const [qrImage, setQrImage] = useState(''); const [qrError, setQrError] = useState(''); const [deleteOpen,setDeleteOpen]=useState(false); const [deleteConfirmation,setDeleteConfirmation]=useState('');
  const filterQuery = useMemo(() => { const p = new URLSearchParams(); if(search)p.set('search',search); if(level)p.set('level',level); if(status)p.set('milestone',status); return p; }, [search,level,status]);
  const queryString = useMemo(() => { const p = new URLSearchParams(filterQuery); p.set('per_page', '100'); p.set('page', String(page)); return `?${p}`; }, [filterQuery,page]);
  const details = useQuery({ queryKey: ['student-policy', id, queryString], queryFn: () => getPolicyCampaign(id, queryString), placeholderData: previousData => previousData?.campaign.id === Number(id) ? previousData : undefined });
  const lastSuccessfulDetails = useRef<{ id: string; data: CampaignDetails } | null>(null);
  if (details.data && ! details.isPlaceholderData) lastSuccessfulDetails.current = { id, data: details.data };
  const displayedDetails = details.data ?? (lastSuccessfulDetails.current?.id === id ? lastSuccessfulDetails.current.data : null);
  const publicLink = displayedDetails?.campaign.status === 'published' ? `${window.location.origin}/portal/student-policies/${displayedDetails.campaign.public_id}` : '';
  useEffect(() => {
    if (!qrOpen || !publicLink) return;
    let active = true;
    setQrImage(''); setQrError('');
    QRCode.toDataURL(publicLink, { width: 360, margin: 2 })
      .then(image => { if (active) setQrImage(image); })
      .catch(() => { if (active) setQrError('تعذر إنشاء رمز QR. يمكنك نسخ الرابط مباشرة.'); });
    return () => { active = false; };
  }, [qrOpen, publicLink]);
  const refresh = () => qc.invalidateQueries({ queryKey: ['student-policy', id] });
  const action = useMutation({ mutationFn: async (fn:()=>Promise<unknown>) => fn(), onSuccess: () => { setNoticeError(false); setNotice('تم حفظ التحديث بنجاح.'); refresh(); }, onError: (e:Error)=>{setNoticeError(true);setNotice(e.message)} });
  const remove = useMutation({ mutationFn: () => deletePolicyCampaign(Number(id), deleteConfirmation), onSuccess: () => navigate('/student-policies', { replace: true }), onError: (e:Error) => {setNoticeError(true);setNotice(e.message)} });
  if (details.isLoading && ! displayedDetails) return <LoadingState />;
  if (! displayedDetails) return <p role="alert" className="p-8 text-center text-red-700">{details.error instanceof Error ? details.error.message : 'تعذر تحميل الحملة.'}</p>;
  const { campaign } = displayedDetails; const rows = displayedDetails.assignments.data ?? [];
  const rosterReadOnly = details.isPlaceholderData || details.isError;
  const copyPublicLink = async () => {
    try {
      await navigator.clipboard.writeText(publicLink);
      setNoticeError(false); setNotice('تم نسخ رابط الطالب.');
    } catch {
      setNoticeError(true); setNotice('تعذر نسخ الرابط؛ يمكنك نسخه من الحقل الظاهر.');
    }
  };
  const downloadScan = async (row: PolicyAssignment) => {
    try {
      await downloadPrivateFile(`/student-policies/assignments/${row.id}/scan`, row.scan_name || 'signed.pdf');
    } catch (error) {
      setNoticeError(true);
      setNotice(error instanceof Error ? error.message : 'تعذر تنزيل النسخة الموقعة.');
    }
  };

  return <div className="space-y-4" dir="rtl">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><Link to="/student-policies" className="mb-2 inline-flex items-center gap-1 text-sm font-bold text-teal-700"><ArrowRight className="h-4 w-4"/>كل الحملات</Link><h1 className="text-xl font-black text-slate-900">{campaign.document.title_ar}</h1><p className="mt-1 text-sm text-slate-500">الإصدار {campaign.document.version_label} · {campaign.academic_year?.code} · آخر موعد للتسليم {campaign.deadline}</p></div><div className="flex flex-wrap gap-2"><a target="_blank" rel="noreferrer" href={`/api/v1/student-policies/campaigns/${campaign.id}/document?language=ar`} className="rounded-xl border bg-white px-4 py-2 text-sm font-bold"><BookOpenCheck className="ml-2 inline h-4 w-4"/>النسخة العربية</a>{campaign.document.has_english_document&&<a target="_blank" rel="noreferrer" href={`/api/v1/student-policies/campaigns/${campaign.id}/document?language=en`} className="rounded-xl border bg-white px-4 py-2 text-sm font-bold"><BookOpenCheck className="ml-2 inline h-4 w-4"/>English version</a>}{campaign.status==='published'&&<button onClick={()=>setQrOpen(true)} className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-bold text-white"><QrCode className="ml-2 inline h-4 w-4"/>رابط وباركود الطالب</button>}{manage&&campaign.status==='draft'&&<button onClick={()=>action.mutate(()=>publishPolicyCampaign(campaign.id))} className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-bold text-white"><Send className="ml-2 inline h-4 w-4"/>نشر الحملة</button>}{manage&&campaign.status==='published'&&<button onClick={()=>confirm('إغلاق الحملة وإيقاف تنزيل النسخ من الرابط العام؟')&&action.mutate(()=>closePolicyCampaign(campaign.id))} className="rounded-xl border border-red-200 px-4 py-2 text-sm font-bold text-red-700"><XCircle className="ml-2 inline h-4 w-4"/>إغلاق</button>}{manage&&<button onClick={()=>{setDeleteConfirmation('');setDeleteOpen(true)}} className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700"><Trash2 className="ml-2 inline h-4 w-4"/>حذف الحملة نهائيًا</button>}</div></div>
    {notice&&<div role={noticeError?'alert':'status'} className={`rounded-xl p-3 text-sm font-bold ${noticeError?'bg-red-50 text-red-800':'bg-teal-50 text-teal-800'}`}>{notice}</div>}
    {details.isError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800">{details.error instanceof Error ? details.error.message : 'تعذر تحديث نتائج البحث.'}</p>}
    <div className="grid grid-cols-3 gap-2">{[['الطلبة','total'],['نسخ مستلمة','paper_received'],['نسخ موقعة مرفوعة','scan_attached']].map(([label,key])=><div key={key} className="rounded-xl border bg-white p-3"><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-1 text-xl font-black">{campaign.counts?.[key]??0}</p></div>)}</div>
    <div className="flex flex-col gap-2 rounded-2xl border bg-white p-3 md:flex-row"><label className="relative flex-1"><Search className="absolute right-3 top-3 h-4 w-4 text-slate-400"/><input aria-label="بحث باسم الطالب أو رقمه" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);setSelected([])}} placeholder="بحث باسم الطالب أو رقمه" className="w-full rounded-xl border py-2.5 pr-9 pl-3 text-sm"/></label><select aria-label="السنة الدراسية" value={level} onChange={e=>{setLevel(e.target.value);setPage(1);setSelected([])}} className="rounded-xl border px-3 py-2.5 text-sm"><option value="">كل السنوات</option>{Object.entries(levelLabel).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><select aria-label="حالة النسخة الورقية" value={status} onChange={e=>{setStatus(e.target.value);setPage(1);setSelected([])}} className="rounded-xl border px-3 py-2.5 text-sm"><option value="">كل الحالات</option><option value="not_received">لم تُستلم</option><option value="paper_received">مستلمة</option><option value="scan_missing">بلا نسخة مرفوعة</option><option value="scan_attached">نسخة مرفوعة</option></select>{manage&&selected.length>0&&<button disabled={action.isPending || rosterReadOnly} onClick={()=>confirm(`تسجيل استلام ${selected.length} نسخة ورقية؟`)&&action.mutate(async()=>{await bulkRecordPaperReceipt(selected);setSelected([])})} className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">تسجيل استلام ({selected.length})</button>}</div>
    {details.isFetching && <p role="status" className="text-xs text-slate-500">جارٍ تحديث النتائج…</p>}
    <div className="overflow-hidden rounded-2xl border bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-[720px] w-full text-sm">
          <thead className="bg-slate-50 text-slate-600"><tr>
            {manage && <th className="p-3"><input aria-label="تحديد الجميع" type="checkbox" disabled={rosterReadOnly} checked={rows.length > 0 && rows.every(row => selected.includes(row.id))} onChange={e => setSelected(e.target.checked ? rows.map(row => row.id) : [])}/></th>}
            <th className="p-3 text-right">الطالب</th><th className="p-3 text-right">السنة</th><th className="p-3 text-right">الاستلام الورقي</th><th className="p-3 text-right">النسخة الموقعة</th>
          </tr></thead>
          <tbody>{rows.map(row => <tr key={row.id} className="border-t border-slate-100">
            {manage && <td className="p-3"><input aria-label={`تحديد ${row.student.full_name_ar}`} type="checkbox" disabled={rosterReadOnly} checked={selected.includes(row.id)} onChange={e => setSelected(e.target.checked ? [...selected, row.id] : selected.filter(id => id !== row.id))}/></td>}
            <td className="p-3"><b>{row.student.full_name_ar}</b><span className="block text-xs text-slate-500">{row.student.university_number}</span></td>
            <td className="p-3">{levelLabel[row.student.academic_level] ?? row.student.academic_level}</td>
            <td className="p-3">{row.paper_received_at ? <span className="font-bold text-emerald-700">مستلمة</span> : manage ? <button disabled={action.isPending || rosterReadOnly} onClick={() => action.mutate(() => recordPaperReceipt(row.id))} className="font-bold text-teal-700 disabled:opacity-50">تسجيل الاستلام</button> : 'لم تُستلم'}</td>
            <td className="p-3">{row.scan_attached && <button onClick={() => void downloadScan(row)} className="ml-3 font-bold text-teal-700">تنزيل النسخة</button>}{manage && <label className="inline-flex cursor-pointer items-center gap-1 font-bold text-teal-700"><FileUp className="h-4 w-4"/>{row.scan_attached ? 'استبدال النسخة' : 'رفع نسخة موقعة'}<input className="hidden" type="file" disabled={action.isPending || rosterReadOnly} accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) action.mutate(() => uploadPolicyScan(row.id, file)); }}/></label>}{!manage && !row.scan_attached && 'لم تُرفع'}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="p-10 text-center text-slate-500">لا توجد نتائج مطابقة.</p>}
    </div>
    <div className="flex items-center justify-between gap-3 text-sm text-slate-600"><span>عرض {rows.length} من {displayedDetails.assignments.total} نتيجة · صفحة {displayedDetails.assignments.current_page} من {displayedDetails.assignments.last_page}</span><div className="flex gap-2"><button type="button" disabled={page<=1 || details.isPlaceholderData || details.isError} onClick={()=>{setPage(current=>current-1);setSelected([])}} className="rounded-xl border bg-white px-3 py-2 disabled:opacity-50">السابق</button><button type="button" disabled={page>=displayedDetails.assignments.last_page || details.isPlaceholderData || details.isError} onClick={()=>{setPage(current=>current+1);setSelected([])}} className="rounded-xl border bg-white px-3 py-2 disabled:opacity-50">التالي</button></div></div>
    <Modal isOpen={qrOpen} onClose={()=>setQrOpen(false)} title="رابط وباركود الطالب" maxWidth="sm" backdropTone="light"><div className="space-y-4 text-center"><p className="text-sm leading-6 text-slate-600">شارك الرابط أو اطبع الباركود ليصل الطالب مباشرة إلى النسختين العربية والإنجليزية.</p>{qrImage ? <img src={qrImage} alt="باركود رابط سياسات الطلبة" className="mx-auto h-60 w-60" /> : <p className="text-sm text-slate-500">{qrError || 'جارٍ تجهيز الباركود…'}</p>}<input aria-label="رابط الطالب" readOnly value={publicLink} onFocus={event=>event.target.select()} className="w-full rounded-xl border bg-slate-50 p-3 text-left text-xs" dir="ltr" /><div className="flex justify-center gap-2"><button onClick={()=>void copyPublicLink()} className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-sm font-bold text-white"><Copy className="h-4 w-4" />نسخ الرابط</button>{qrImage && <a href={qrImage} download={`student-policy-${campaign.id}-qr.png`} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold"><Download className="h-4 w-4" />تنزيل الباركود</a>}</div></div></Modal>
    <Modal isOpen={deleteOpen} onClose={()=>!remove.isPending&&setDeleteOpen(false)} title="حذف الحملة نهائيًا" maxWidth="sm" backdropTone="light"><div className="space-y-4"><p className="text-sm leading-6 text-slate-600">سيحذف النظام الحملة وملفاتها نهائيًا. لا يمكن حذف حملة لديها نشاط مسجّل سابقًا.</p><label className="block text-sm font-bold text-slate-700">اكتب «حذف الحملة» للتأكيد<input autoFocus value={deleteConfirmation} onChange={e=>setDeleteConfirmation(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5"/></label>{remove.isError&&<p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{(remove.error as Error).message}</p>}<div className="flex gap-2"><button type="button" disabled={deleteConfirmation!=='حذف الحملة'||remove.isPending} onClick={()=>remove.mutate()} className="rounded-xl bg-red-700 px-4 py-2.5 text-sm font-bold text-white disabled:bg-slate-300">{remove.isPending?'جارٍ الحذف...':'تأكيد الحذف النهائي'}</button><button type="button" disabled={remove.isPending} onClick={()=>setDeleteOpen(false)} className="rounded-xl border px-4 py-2.5 text-sm font-bold">إلغاء</button></div></div></Modal>
  </div>;
}
