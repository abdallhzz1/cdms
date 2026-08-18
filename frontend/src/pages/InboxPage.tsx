import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Link } from 'react-router-dom';
import { Clock, ArrowRight } from 'lucide-react';

export function InboxPage() {
  const { can } = useAuth();
  const { locale, t } = useI18n();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['inbox'],
    queryFn: () => apiFetch<any>('/correspondence?filter=inbox&per_page=50')
  });

  if (!can('correspondence.view')) return <ErrorState title={t('state.forbidden.title')} message={t('state.forbidden.message')} />;
  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const items = Array.isArray(data) ? data : data?.items || [];

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 pb-12">
      <PageHeader 
        title={locale === 'ar' ? 'صندوق الوارد' : 'Inbox'} 
        description={locale === 'ar' ? 'المراسلات والطلبات التي تنتظر مراجعتك واعتمادك' : 'Correspondences and requests pending your review and approval'} 
      />

      {!items.length ? (
        <EmptyState message={locale === 'ar' ? 'صندوق الوارد فارغ. لا يوجد طلبات معلقة.' : 'Your inbox is empty. No pending requests.'}  />
      ) : (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'رقم المرجع' : 'Ref No'}</th>
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'الموضوع' : 'Subject'}</th>
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'المرسل' : 'Sender'}</th>
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'التاريخ' : 'Date'}</th>
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'الأهمية' : 'Priority'}</th>
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
                    <td className="px-6 py-4">
                      <div className="text-sm font-semibold text-slate-700">
                        {locale === 'ar' ? item.sender?.person?.full_name_ar : item.sender?.person?.full_name_en || item.sender?.person?.full_name_ar || item.sender?.email}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(item.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-1 rounded-md text-xs font-bold ${
                        item.priority === 'urgent' || item.priority === 'critical' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {item.priority?.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-end">
                      <Link 
                        to={`/correspondence/${item.id}`} 
                        className="inline-flex items-center justify-center p-2 rounded-lg text-indigo-600 hover:bg-indigo-50 transition-colors"
                        title={locale === 'ar' ? 'عرض ومراجعة' : 'View & Review'}
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
    </div>
  );
}
