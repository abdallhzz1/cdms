import { useI18n } from '@/i18n/I18nContext';

interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message }: LoadingStateProps) {
  const { t } = useI18n();
  return (
    <div role="status" aria-live="polite" className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 text-center sm:p-8">
      <div aria-hidden="true" className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-teal-600"></div>
      <p className="text-sm font-medium text-slate-500">{message || t('common.loading')}</p>
    </div>
  );
}
