import { useI18n } from '@/i18n/I18nContext';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ title, message, onRetry }: ErrorStateProps) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center p-8 text-center bg-red-50 rounded-lg border border-red-100">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 mb-4">
        <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-red-800 mb-1">{title || t('state.error.title', 'حدث خطأ')}</h3>
      <p className="text-sm text-red-600 max-w-sm mb-4">{message || t('state.error.message', 'حدث خطأ غير متوقع أثناء معالجة طلبك.')}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center justify-center rounded-md bg-white px-3 py-1.5 text-sm font-medium text-red-700 shadow-sm border border-red-200 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
        >
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}
