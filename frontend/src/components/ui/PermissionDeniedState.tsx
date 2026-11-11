import { useI18n } from '@/i18n/I18nContext';

interface PermissionDeniedStateProps {
  message?: string;
}

export function PermissionDeniedState({ message }: PermissionDeniedStateProps) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 text-center sm:p-8">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-600 ring-1 ring-slate-200">
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>
      <h3 className="mb-1 text-sm font-bold text-slate-900">{t('state.forbidden.title', 'الوصول مرفوض')}</h3>
      <p className="max-w-sm text-sm leading-6 text-slate-600">{message || t('state.forbidden.message', 'ليس لديك الصلاحية لتنفيذ هذا الإجراء أو عرض هذه الصفحة.')}</p>
    </div>
  );
}
