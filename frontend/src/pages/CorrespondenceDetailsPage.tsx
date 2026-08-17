import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Button } from '@/components/ui/Button';
import { ArrowRight, CheckCircle2, CornerUpLeft, Forward, Check, XCircle } from 'lucide-react';

export function CorrespondenceDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const { locale } = useI18n();
  const queryClient = useQueryClient();

  const { data: item, isLoading, isError, refetch } = useQuery({
    queryKey: ['correspondence', id],
    queryFn: () => apiFetch<any>(`/correspondence/${id}`),
    enabled: Boolean(id)
  });

  const { data: allUsers } = useQuery({
    queryKey: ['users-lookup'],
    queryFn: () => apiFetch<any>('/users/lookup'),
    enabled: Boolean(item)
  });

  const [forwardUserId, setForwardUserId] = useState('');
  const [returnReason, setReturnReason] = useState('');

  const forwardMutation = useMutation({
    mutationFn: (userId: string) => apiFetch(`/correspondence/${id}/forward`, { method: 'POST', body: { assigned_to: userId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['correspondence', id] });
      queryClient.invalidateQueries({ queryKey: ['inbox'] });
      navigate('/inbox');
    }
  });

  const approveMutation = useMutation({

    mutationFn: () => apiFetch(`/correspondence/${id}/approve`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['correspondence', id] });
    }
  });

  const returnMutation = useMutation({
    mutationFn: (reason: string) => apiFetch(`/correspondence/${id}/return`, { method: 'POST', body: { reason } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['correspondence', id] });
      queryClient.invalidateQueries({ queryKey: ['inbox'] });
      navigate('/inbox');
    }
  });

  if (isLoading) return <LoadingState />;
  if (isError || !item) return <ErrorState onRetry={() => refetch()} />;

  const isAssignedToMe = item.assigned_to === user?.id;
  const isSender = item.sender_id === user?.id;
  const isDraft = item.status === 'draft';

  const handleForward = () => {
    if (!forwardUserId) return alert(locale === 'ar' ? 'الرجاء اختيار شخص للتحويل إليه' : 'Please select a user');
    forwardMutation.mutate(forwardUserId);
  };

  const handleReturn = () => {
    const reason = prompt(locale === 'ar' ? 'سبب الإرجاع:' : 'Return reason:');
    if (reason) returnMutation.mutate(reason);
  };

  return (
    <div className="mx-auto max-w-[900px] space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors">
          <ArrowRight className="w-4 h-4 rtl:rotate-180" />
          {locale === 'ar' ? 'رجوع' : 'Back'}
        </button>
        <span className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm font-bold border border-indigo-100">
          {item.reference_number}
        </span>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden relative">
        {/* Header */}
        <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50">
          <div className="flex flex-wrap gap-2 mb-3">
            <span className="px-2 py-1 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600">
              {item.priority?.toUpperCase()}
            </span>
            <span className="px-2 py-1 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600">
              {item.status.toUpperCase()}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">{item.subject}</h1>
          <div className="flex items-center gap-6 text-sm text-slate-500">
            <div>
              <span className="font-semibold text-slate-700">{locale === 'ar' ? 'المرسل:' : 'From:'} </span>
              {item.sender?.person?.full_name_ar || item.sender?.email}
            </div>
            <div>
              <span className="font-semibold text-slate-700">{locale === 'ar' ? 'المُحال إليه:' : 'Assigned To:'} </span>
              {item.assignee ? (item.assignee.person?.full_name_ar || item.assignee.email) : '—'}
            </div>
            <div>
              <span className="font-semibold text-slate-700">{locale === 'ar' ? 'التاريخ:' : 'Date:'} </span>
              {new Date(item.created_at).toLocaleString()}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-8 py-8">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">{locale === 'ar' ? 'نص المراسلة / التفاصيل' : 'Details'}</h3>
          <div className="prose prose-slate max-w-none text-slate-800 whitespace-pre-wrap">
            {item.summary || (locale === 'ar' ? 'لا يوجد نص.' : 'No content.')}
          </div>
        </div>

        {/* Actions for Assigned User */}
        {isAssignedToMe && item.status !== 'closed' && (
          <div className="px-8 py-6 border-t border-slate-100 bg-indigo-50/30 flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1 w-full">
              <label className="block text-sm font-bold text-slate-700 mb-2">{locale === 'ar' ? 'تحويل إلى (للاعتماد التالي):' : 'Forward To:'}</label>
              <select value={forwardUserId} onChange={e => setForwardUserId(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                <option value="">{locale === 'ar' ? '-- اختر المسؤول --' : '-- Select --'}</option>
                {((Array.isArray(allUsers) ? allUsers : allUsers?.items) || []).map((u: any) => (
                  <option key={u.id} value={u.id}>{u.person?.full_name_ar || u.email} ({u.roles?.[0]?.name})</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button onClick={handleForward} isLoading={forwardMutation.isPending} className="flex-1 flex items-center justify-center gap-2">
                <Forward className="w-4 h-4" />
                {locale === 'ar' ? 'تحويل' : 'Forward'}
              </Button>
              <Button variant="outline" onClick={handleReturn} isLoading={returnMutation.isPending} className="flex-1 flex items-center justify-center gap-2 text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200">
                <CornerUpLeft className="w-4 h-4" />
                {locale === 'ar' ? 'إرجاع' : 'Return'}
              </Button>
              <Button variant="outline" onClick={() => approveMutation.mutate()} isLoading={approveMutation.isPending} className="flex-1 flex items-center justify-center gap-2 text-emerald-600 hover:bg-emerald-50 border-emerald-200">
                <CheckCircle2 className="w-4 h-4" />
                {locale === 'ar' ? 'اعتماد نهائي' : 'Approve'}
              </Button>
            </div>
          </div>
        )}

        {/* Actions for Sender (Draft) */}
        {isDraft && item.sender_id === user?.id && (
          <div className="px-8 py-6 border-t border-slate-100 bg-amber-50/50 flex flex-col sm:flex-row gap-4 items-end">
             <div className="flex-1 w-full">
              <label className="block text-sm font-bold text-slate-700 mb-2">{locale === 'ar' ? 'إرسال إلى (المستلم):' : 'Send To:'}</label>
              <select value={forwardUserId} onChange={e => setForwardUserId(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500">
                <option value="">{locale === 'ar' ? '-- اختر المستلم --' : '-- Select --'}</option>
                {((Array.isArray(allUsers) ? allUsers : allUsers?.data) || []).map((u: any) => (
                  <option key={u.id} value={u.id}>{u.name || u.email}</option>
                ))}
              </select>
            </div>
            <Button onClick={handleForward} isLoading={forwardMutation.isPending} className="flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 text-white w-full sm:w-auto">
              <Forward className="w-4 h-4 rtl:rotate-180" />
              {locale === 'ar' ? 'إرسال الطلب' : 'Send Request'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
