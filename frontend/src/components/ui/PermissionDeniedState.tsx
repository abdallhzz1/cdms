import { useI18n } from '@/i18n/I18nContext';

interface PermissionDeniedStateProps {
  message?: string;
}

export function PermissionDeniedState({ message }: PermissionDeniedStateProps) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center p-8 text-center bg-slate-50 rounded-lg border border-slate-200">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 mb-4">
        <svg className="h-6 w-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-slate-900 mb-1">{t('state.forbidden.title', 'الوصول مرفوض')}</h3>
      <p className="text-sm text-slate-500 max-w-sm">{message || t('state.forbidden.message', 'ليس لديك الصلاحية لتنفيذ هذا الإجراء أو عرض هذه الصفحة.')}</p>
    </div>
  );
}
