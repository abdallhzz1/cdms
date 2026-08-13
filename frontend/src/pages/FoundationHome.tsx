import { useI18n } from '@/i18n/I18nContext';
import { useHealthCheck } from '@/api/health';

/**
 * Temporary Foundation/Home page (Prompt 01 §10) — verifies routing, i18n,
 * and the API client/TanStack Query wiring against the real backend health
 * endpoint. Not a business dashboard; replaced once real modules exist.
 */
export function FoundationHome() {
  const { t } = useI18n();
  const { data, isLoading, isError, refetch, isFetching } = useHealthCheck();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{t('foundation.title')}</h1>
        <p className="text-sm text-slate-500">{t('foundation.subtitle')}</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">{t('foundation.apiStatusHeading')}</h2>

        {isLoading && <p className="text-sm text-slate-500">{t('foundation.apiStatusChecking')}</p>}

        {isError && (
          <div className="space-y-2">
            <p className="text-sm text-red-700">{t('foundation.apiStatusError')}</p>
            <p className="text-xs text-slate-500">{t('foundation.apiStatusErrorHint')}</p>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              {t('common.retry')}
            </button>
          </div>
        )}

        {data && (
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
              <dt className="text-slate-500">{t('foundation.applicationLabel')}</dt>
              <dd
                data-testid="application-status"
                className={data.application === 'ok' ? 'font-medium text-emerald-700' : 'font-medium text-red-700'}
              >
                {data.application === 'ok' ? t('foundation.statusOk') : t('foundation.statusUnreachable')}
              </dd>
            </div>
            <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
              <dt className="text-slate-500">{t('foundation.databaseLabel')}</dt>
              <dd
                data-testid="database-status"
                className={data.database === 'ok' ? 'font-medium text-emerald-700' : 'font-medium text-red-700'}
              >
                {data.database === 'ok' ? t('foundation.statusOk') : t('foundation.statusUnreachable')}
              </dd>
            </div>
          </dl>
        )}
      </section>
    </div>
  );
}
