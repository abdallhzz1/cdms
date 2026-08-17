import type { PaginatedResponse } from '@/api/distribution';
import type { DistributionVersionDetail } from '@/api/distribution';

import { useState, useEffect } from 'react';
import { useI18n } from '@/i18n/I18nContext';
import {
  getAuditLogs
} from '@/api/distribution';
import type {
  AuditLogItem
} from '@/api/distribution';


interface AuditHistoryTabProps {
  version: DistributionVersionDetail;
}

export function AuditHistoryTab({ version }: AuditHistoryTabProps) {
  const { locale, t } = useI18n();
  const [data, setData] = useState<PaginatedResponse<AuditLogItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getAuditLogs(version.id, page);
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load audit history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [version.id, page]);

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 p-4 text-xs font-medium text-red-800 border border-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-slate-500">{t('audit.loading')}</div>
      ) : !data || data.data.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
          {t('audit.empty')}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-start text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">{t('audit.timestamp')}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t('audit.user')}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t('audit.action')}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t('audit.overrideStatus')}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t('audit.details')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {data.data.map((log) => {
                  let actionBadge = (
                    <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      {log.action}
                    </span>
                  );

                  if (log.action === 'version.approved') {
                    actionBadge = (
                      <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/20 ring-inset">
                        APPROVED
                      </span>
                    );
                  } else if (log.action === 'version.approval_revoked') {
                    actionBadge = (
                      <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-600/20 ring-inset">
                        APPROVAL REVOKED
                      </span>
                    );
                  } else if (log.action === 'version.published') {
                    actionBadge = (
                      <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-600/20 ring-inset">
                        PUBLISHED
                      </span>
                    );
                  } else if (log.action === 'version.superseded') {
                    actionBadge = (
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                        SUPERSEDED
                      </span>
                    );
                  }

                  return (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                        {new Date(log.created_at).toLocaleString(locale === 'ar' ? 'ar-PS' : 'en-US')}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900 text-xs">
                        {log.user ? log.user.name : `User #${log.user_id}`}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">{actionBadge}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs">
                        {log.is_override ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center rounded bg-red-50 px-1.5 py-0.5 font-semibold text-red-700 text-[10px]">
                              {t('audit.override')}
                            </span>
                            {log.override_reason && (
                              <div className="text-[11px] text-red-600 italic">
                                "{log.override_reason}"
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">{t('audit.standard')}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-600 max-w-xs truncate">
                        {log.changes ? JSON.stringify(log.changes) : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {data.last_page > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
              <div className="text-xs text-slate-500">
                {t('audit.pageSummary').replace('{current}', String(data.current_page)).replace('{last}', String(data.last_page)).replace('{total}', String(data.total))}
              </div>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-700 disabled:opacity-50"
                >
                  {t('common.previous')}
                </button>
                <button
                  disabled={page >= data.last_page}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-700 disabled:opacity-50"
                >
                  {t('common.next')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

