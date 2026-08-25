import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { CheckCircle, Clock, XCircle } from 'lucide-react';

export function AssessmentsMasterPage() {
  const { can } = useAuth();
  const { locale } = useI18n();
  const queryClient = useQueryClient();

  const { data: assessments, isLoading, isError, refetch } = useQuery({
    queryKey: ['clinical-assessments'],
    queryFn: () => apiFetch<any>('/clinical-assessments?per_page=50'),
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/clinical-assessments/${id}/approve`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clinical-assessments'] }),
  });

  const returnMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiFetch(`/clinical-assessments/${id}/return`, { method: 'POST', body: { reason } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clinical-assessments'] }),
  });

  if (!can('assessment.view')) return <ErrorState title="Access Denied" />;
  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const items = Array.isArray(assessments) ? assessments : assessments?.items || [];

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
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'الحالة' : 'Status'}</th>
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'إجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((a: any, i: number) => (
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
                    <td className="px-6 py-4">{getStatusBadge(a.status)}</td>
                    <td className="px-6 py-4">
                      {a.status === 'submitted' && can('assessment.approve') && (
                        <div className="flex items-center gap-2">
                          <Button
                            onClick={() => approveMutation.mutate(a.id)}
                            isLoading={approveMutation.isPending}
                            className="!py-1.5 !px-3 !text-xs"
                          >
                            {locale === 'ar' ? 'اعتماد' : 'Approve'}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => returnMutation.mutate({ id: a.id, reason: 'Returned for revision' })}
                            isLoading={returnMutation.isPending}
                            className="!py-1.5 !px-3 !text-xs"
                          >
                            {locale === 'ar' ? 'إعادة' : 'Return'}
                          </Button>
                        </div>
                      )}
                      {a.status !== 'submitted' && <span className="text-slate-400 text-sm">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
