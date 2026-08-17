import { useI18n } from '@/i18n/I18nContext';

interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message }: LoadingStateProps) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center p-8 text-center bg-white rounded-lg border border-slate-200">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600 mb-4"></div>
      <p className="text-sm font-medium text-slate-500">{message || t('common.loading')}</p>
    </div>
  );
}
