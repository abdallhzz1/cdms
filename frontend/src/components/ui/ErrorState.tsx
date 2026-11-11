import { useI18n } from '@/i18n/I18nContext';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ title, message, onRetry }: ErrorStateProps) {
  const { t } = useI18n();
  return (
    <div role="alert" className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center sm:p-8">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-rose-700 shadow-sm ring-1 ring-rose-200">
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h3 className="mb-1 text-sm font-bold text-rose-900">{title || t('state.error.title', 'حدث خطأ')}</h3>
      <p className="mb-4 max-w-sm text-sm leading-6 text-rose-800">{message || t('state.error.message', 'حدث خطأ غير متوقع أثناء معالجة طلبك.')}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-rose-300 bg-white px-4 text-sm font-bold text-rose-800 shadow-sm transition-colors hover:bg-rose-100 focus-visible:ring-2 focus-visible:ring-rose-700 focus-visible:ring-offset-2"
        >
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}
