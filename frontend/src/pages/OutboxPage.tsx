import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Link } from 'react-router-dom';
import { Clock, Plus, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function OutboxPage() {
  const { can } = useAuth();
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ subject: '', summary: '', priority: 'normal', assignedTo: '' });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['outbox'],
    queryFn: () => apiFetch<any>('/correspondence?filter=outbox&per_page=50')
  });

  const { data: usersLookup } = useQuery({
    queryKey: ['users-lookup'],
    queryFn: () => apiFetch<any>('/users/lookup'),
    enabled: isModalOpen
  });

  const createMutation = useMutation({
    mutationFn: (newReq: any) => apiFetch('/correspondence', { method: 'POST', body: newReq }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outbox'] });
      setIsModalOpen(false);
      setFormData({ subject: '', summary: '', priority: 'normal', assignedTo: '' });
    }
  });

  if (!can('correspondence.view')) return <ErrorState title={t('state.forbidden.title')} message={t('state.forbidden.message')} />;
  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const items = Array.isArray(data) ? data : data?.items || [];
  const availableUsers = Array.isArray(usersLookup) ? usersLookup : usersLookup?.data || [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      direction: 'internal',
      subject: formData.subject,
      summary: formData.summary,
      priority: formData.priority,
      correspondence_date: new Date().toISOString().split('T')[0],
      assigned_to: formData.assignedTo || null
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft': return <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded-md text-xs font-bold">{locale === 'ar' ? 'مسودة' : 'Draft'}</span>;
      case 'submitted': return <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-md text-xs font-bold">{locale === 'ar' ? 'قيد المراجعة' : 'Pending'}</span>;
      case 'returned': return <span className="px-2 py-1 bg-red-100 text-red-700 rounded-md text-xs font-bold">{locale === 'ar' ? 'مرجع' : 'Returned'}</span>;
      case 'approved': return <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-md text-xs font-bold">{locale === 'ar' ? 'تم الاعتماد' : 'Approved'}</span>;
      case 'closed': return <span className="px-2 py-1 bg-slate-800 text-white rounded-md text-xs font-bold">{locale === 'ar' ? 'مغلق' : 'Closed'}</span>;
      default: return <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded-md text-xs font-bold">{status}</span>;
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader 
          title={locale === 'ar' ? 'الطلبات الصادرة' : 'Outbox'} 
          description={locale === 'ar' ? 'تابع حالة الطلبات والمراسلات الصادرة الخاصة بك' : 'Track the status of your sent requests and correspondences'} 
        />
        {can('correspondence.create') && (
          <Button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            {locale === 'ar' ? 'إنشاء وإرسال طلب' : 'New Request'}
          </Button>
        )}
      </div>

      {!items.length ? (
        <EmptyState message={locale === 'ar' ? 'صندوق الصادر فارغ.' : 'Your outbox is empty.'}  />
      ) : (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'رقم المرجع' : 'Ref No'}</th>
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'الموضوع' : 'Subject'}</th>
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'المرسل إليه' : 'Assigned To'}</th>
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'الحالة' : 'Status'}</th>
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'التاريخ' : 'Date'}</th>
                  <th className="px-6 py-4 font-semibold text-end">{locale === 'ar' ? 'إجراء' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item: any) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4 text-sm font-semibold text-slate-500">{item.reference_number}</td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-bold text-slate-900 line-clamp-1">{item.subject}</div>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-700">
                      {item.assignee ? (locale === 'ar' ? item.assignee.name : item.assignee.name) : '---'}
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(item.status)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(item.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-end">
                      <Link 
                        to={`/correspondence/${item.id}`} 
                        className="inline-flex items-center justify-center p-2 rounded-lg text-indigo-600 hover:bg-indigo-50 transition-colors"
                      >
                        <ArrowRight className="w-5 h-5 rtl:rotate-180" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
              <h3 className="font-bold text-lg text-slate-800">{locale === 'ar' ? 'إنشاء وإرسال طلب جديد' : 'New Request'}</h3>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'إرسال إلى (المستلم)' : 'Send To (Recipient)'}</label>
                <select required value={formData.assignedTo} onChange={e => setFormData({ ...formData, assignedTo: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                  <option value="">{locale === 'ar' ? '-- اختر المستلم --' : '-- Select Recipient --'}</option>
                  {availableUsers.map((u: any) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'الموضوع' : 'Subject'}</label>
                <input required value={formData.subject} onChange={e => setFormData({ ...formData, subject: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" placeholder={locale === 'ar' ? 'مثال: طلب عذر غياب' : 'e.g., Absence Excuse'} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'التفاصيل / النص' : 'Details / Body'}</label>
                <textarea required rows={4} value={formData.summary} onChange={e => setFormData({ ...formData, summary: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" placeholder={locale === 'ar' ? 'اكتب تفاصيل الطلب هنا...' : 'Write your details here...'}></textarea>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'الأهمية' : 'Priority'}</label>
                <select value={formData.priority} onChange={e => setFormData({ ...formData, priority: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                  <option value="normal">{locale === 'ar' ? 'عادي (Normal)' : 'Normal'}</option>
                  <option value="urgent">{locale === 'ar' ? 'عاجل (Urgent)' : 'Urgent'}</option>
                </select>
              </div>
              
              <div className="flex justify-end gap-3 pt-6 mt-6 border-t border-slate-100">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
                <Button type="submit" isLoading={createMutation.isPending}>{locale === 'ar' ? 'إرسال الطلب' : 'Send Request'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
