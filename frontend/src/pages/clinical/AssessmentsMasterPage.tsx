import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { CheckCircle, Clock, Search, XCircle } from 'lucide-react';

export function AssessmentsMasterPage() {
  const { can, user } = useAuth();
  const { locale } = useI18n();
  const queryClient = useQueryClient();
  const [statusFilter,setStatusFilter]=useState('');
  const [search,setSearch]=useState('');
  const [returning,setReturning]=useState<any|null>(null);
  const [returnReason,setReturnReason]=useState('');

  const { data: assessments, isLoading, isError, refetch } = useQuery({
    queryKey: ['clinical-assessments',statusFilter],
    queryFn: () => apiFetch<any>(`/clinical-assessments?per_page=100${statusFilter?`&status=${statusFilter}`:''}`),
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/clinical-assessments/${id}/approve`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clinical-assessments'] }),
  });
  const approveBatchMutation=useMutation({mutationFn:(batchUuid:string)=>apiFetch(`/clinical-assessment-batches/${batchUuid}/approve`,{method:'POST'}),onSuccess:()=>queryClient.invalidateQueries({queryKey:['clinical-assessments']})});

  const returnMutation = useMutation({
    mutationFn: ({ id, batchUuid, reason }: { id?: number; batchUuid?:string; reason: string }) =>
      apiFetch(batchUuid?`/clinical-assessment-batches/${batchUuid}/return`:`/clinical-assessments/${id}/return`, { method: 'POST', body: { reason } }),
    onSuccess: async () => {setReturning(null);setReturnReason('');await queryClient.invalidateQueries({ queryKey: ['clinical-assessments'] });},
  });

  if (!can('assessment.view')) return <ErrorState title="Access Denied" />;
  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const items = (Array.isArray(assessments) ? assessments : assessments?.items || []).filter((item:any)=>{const q=search.trim().toLowerCase();return !q||String(item.student?.university_number??'').toLowerCase().includes(q)||String(item.student?.full_name_ar??'').toLowerCase().includes(q)||String(item.student?.full_name_en??'').toLowerCase().includes(q)||String(item.evaluator?.full_name_ar??'').toLowerCase().includes(q)||String(item.evaluator?.full_name_en??'').toLowerCase().includes(q)});

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label_ar: string; label_en: string; classes: string; icon: any }> = {
      draft:     { label_ar: 'مسودة',    label_en: 'Draft',     classes: 'bg-slate-100 text-slate-600', icon: Clock },
      submitted: { label_ar: 'مرسل',     label_en: 'Submitted', classes: 'bg-teal-50 text-teal-700', icon: Clock },
      approved:  { label_ar: 'معتمد',    label_en: 'Approved',  classes: 'bg-teal-100 text-teal-800', icon: CheckCircle },
      returned:  { label_ar: 'مُعاد',    label_en: 'Returned',  classes: 'bg-slate-100 text-slate-600', icon: XCircle },
    };
    const cfg = map[status] ?? map.draft;
    const Icon = cfg.icon;
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold ${cfg.classes}`}>
        <Icon className="w-3.5 h-3.5" />
        {locale === 'ar' ? cfg.label_ar : cfg.label_en}
      </span>
    );
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 pb-12">
      <PageHeader
        title={locale === 'ar' ? 'التقييمات السريرية' : 'Clinical Assessments'}
        description={locale === 'ar' ? 'مراجعة واعتماد تقييمات الطلاب المرسلة من المشرفين' : 'Review and approve student assessments submitted by supervisors'}
      />

      <section className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_14rem]">
        <label className="relative"><Search className="absolute right-3 top-3 h-4 w-4 text-slate-400"/><input className="input pr-10" value={search} onChange={event=>setSearch(event.target.value)} placeholder={locale==='ar'?'البحث بالطالب أو الرقم الجامعي أو الطبيب…':'Search student, university ID, or evaluator…'}/></label>
        <select className="input" value={statusFilter} onChange={event=>setStatusFilter(event.target.value)}><option value="">{locale==='ar'?'جميع الحالات':'All statuses'}</option><option value="submitted">{locale==='ar'?'بانتظار المراجعة':'Awaiting review'}</option><option value="returned">{locale==='ar'?'مُعاد للتعديل':'Returned'}</option><option value="approved">{locale==='ar'?'معتمد':'Approved'}</option></select>
      </section>

      {returning&&<section className="rounded-3xl border border-teal-200 bg-teal-50 p-4"><h2 className="text-sm font-black text-slate-900">{returning.assessment_batch_uuid?(locale==='ar'?'إعادة تقييم المجموعة كاملة':'Return full group assessment'):(locale==='ar'?'إعادة التقييم للمشرف':'Return assessment to supervisor')}</h2><p className="mt-1 text-xs text-slate-600">{returning.assessment_batch_uuid?(locale==='ar'?'سيتم إرجاع جميع تقييمات هذه المجموعة بنفس السبب.':'Every assessment in this group batch will be returned with the same reason.'):(locale==='ar'?`الطالب: ${returning.student?.full_name_ar??''}`:`Student: ${returning.student?.full_name_en||returning.student?.full_name_ar||''}`)}</p><textarea className="input mt-3 min-h-24" value={returnReason} onChange={event=>setReturnReason(event.target.value)} placeholder={locale==='ar'?'اكتب سبب الإرجاع والتعديل المطلوب بوضوح…':'Clearly state the return reason and required revision…'}/><div className="mt-3 flex gap-2"><Button disabled={returnReason.trim().length<3||returnMutation.isPending} isLoading={returnMutation.isPending} onClick={()=>returnMutation.mutate({id:returning.assessment_batch_uuid?undefined:returning.id,batchUuid:returning.assessment_batch_uuid||undefined,reason:returnReason.trim()})}>{locale==='ar'?'تأكيد الإرجاع':'Confirm return'}</Button><Button variant="outline" onClick={()=>{setReturning(null);setReturnReason('')}}>{locale==='ar'?'إلغاء':'Cancel'}</Button></div></section>}

      {!items.length ? (
        <EmptyState message={locale === 'ar' ? 'لا توجد تقييمات سريرية بعد' : 'No clinical assessments yet'} />
      ) : (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'الطالب' : 'Student'}</th>
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'المقيّم' : 'Evaluator'}</th>
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'النتيجة' : 'Score'}</th>
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'المساق والتاريخ' : 'Course & date'}</th>
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'الحالة' : 'Status'}</th>
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'إجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((a: any, i: number) => {const batchLeader=!a.assessment_batch_uuid||!items.slice(0,i).some((previous:any)=>previous.assessment_batch_uuid===a.assessment_batch_uuid);return (
                  <tr key={a.id ?? i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="text-sm font-bold text-slate-900">{locale === 'ar' ? a.student?.full_name_ar : a.student?.full_name_en || a.student?.full_name_ar}</div>
                      <div className="text-xs text-slate-500">{a.student?.university_number}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {locale === 'ar' ? a.evaluator?.full_name_ar : a.evaluator?.full_name_en || a.evaluator?.full_name_ar || '—'}
                    </td>
                    <td className="px-6 py-4">
                      {a.score != null ? (
                        <span className="text-sm font-bold text-slate-800">
                          {Number(a.score).toFixed(1)}
                          {a.max_score && <span className="text-slate-400 font-normal"> / {Number(a.max_score).toFixed(1)}</span>}
                        </span>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-600"><div className="font-bold text-slate-800">{locale==='ar'?a.session?.rotation_block?.rotation?.course?.name_ar:a.session?.rotation_block?.rotation?.course?.name_en||a.session?.rotation_block?.rotation?.course?.name_ar||'—'}</div><div className="mt-1 text-slate-400">{String(a.session?.session_date??'').slice(0,10)}</div></td>
                    <td className="px-6 py-4">{getStatusBadge(a.status)}</td>
                    <td className="px-6 py-4">
                      {a.status === 'submitted' && can('assessment.approve') && a.evaluator?.user_id!==user?.id && batchLeader && (
                        <div className="flex items-center gap-2">
                          <Button
                            onClick={() => a.assessment_batch_uuid?approveBatchMutation.mutate(a.assessment_batch_uuid):approveMutation.mutate(a.id)}
                            isLoading={approveMutation.isPending||approveBatchMutation.isPending}
                            className="!py-1.5 !px-3 !text-xs"
                          >
                            {a.assessment_batch_uuid?(locale==='ar'?'اعتماد المجموعة':'Approve group'):(locale === 'ar' ? 'اعتماد' : 'Approve')}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {setReturning(a);setReturnReason('')}}
                            isLoading={returnMutation.isPending}
                            className="!py-1.5 !px-3 !text-xs"
                          >
                            {a.assessment_batch_uuid?(locale==='ar'?'إعادة المجموعة':'Return group'):(locale === 'ar' ? 'إعادة' : 'Return')}
                          </Button>
                        </div>
                      )}
                      {a.status==='submitted'&&a.assessment_batch_uuid&&!batchLeader&&<span className="text-[10px] font-bold text-teal-700">{locale==='ar'?'ضمن حزمة المجموعة':'Part of group batch'}</span>}
                      {a.status === 'submitted' && can('assessment.approve') && a.evaluator?.user_id===user?.id && <span className="text-xs font-bold text-slate-400">{locale==='ar'?'لا يمكن اعتماد تقييمك':'Cannot approve your own'}</span>}
                      {a.status === 'returned' && a.return_reason && <p className="max-w-xs text-xs text-slate-500">{locale==='ar'?'سبب الإرجاع: ':'Return reason: '}{a.return_reason}</p>}
                      {a.status !== 'submitted' && !(a.status === 'returned' && a.return_reason) && <span className="text-slate-400 text-sm">—</span>}
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
