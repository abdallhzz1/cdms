import { useI18n } from '@/i18n/I18nContext';

interface EmptyStateProps {
  title?: string;
  message?: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, message, action }: EmptyStateProps) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center sm:p-8">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-teal-700 shadow-sm ring-1 ring-slate-200">
        <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
      </div>
      <h3 className="mb-1 text-sm font-bold text-slate-900">{title || t('state.empty.title', 'لا توجد بيانات')}</h3>
      <p className="mb-4 max-w-sm text-sm leading-6 text-slate-600">{message || t('state.empty.message', 'لم يتم العثور على أي بيانات تطابق معايير البحث الحالية.')}</p>
      {action && <div>{action}</div>}
    </div>
  );
}
