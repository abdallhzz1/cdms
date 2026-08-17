import type { DistributionVersionDetail } from '@/api/distribution';
import { useState, useEffect } from 'react';
import { getConflicts,  } from '@/api/distribution';
import { useI18n } from '@/i18n/I18nContext';

interface ConflictsTabProps {
  version: DistributionVersionDetail;
}

export function ConflictsTab({ version }: ConflictsTabProps) {
  const { t } = useI18n();
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConflicts = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getConflicts(version.id);
      setConflicts(res);
    } catch (err: any) {
      setError(t('state.error.message'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConflicts();
  }, [version.id]);

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 p-4 text-xs font-medium text-red-800 border border-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-slate-500">{t('workflow.conflicts.loading')}</div>
      ) : conflicts.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-emerald-200 bg-emerald-50/50 p-8 text-center">
          <div className="text-emerald-700 font-semibold text-sm">{t('workflow.conflicts.clearTitle')}</div>
          <p className="text-xs text-emerald-600 mt-1">
            {t('workflow.conflicts.clearDescription')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-md bg-red-50 p-4 border border-red-200 text-xs text-red-800">
            <span className="font-semibold">{t('workflow.conflicts.found').replace('{count}', String(conflicts.length))}</span>
            <p className="mt-0.5 text-red-700">
              {t('workflow.conflicts.foundDescription')}
            </p>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-start text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">{t('workflow.conflicts.type')}</th>
                    <th scope="col" className="px-4 py-3 font-semibold">{t('workflow.conflicts.description')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {conflicts.map((conflict, idx) => {
                    const message = typeof conflict === 'string' ? conflict : conflict.message || JSON.stringify(conflict);
                    const type = typeof conflict === 'object' ? conflict.type || t('workflow.conflicts.unspecified') : t('workflow.conflicts.unspecified');

                    return (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-red-600 uppercase">
                          {type}
                        </td>
                        <td className="px-4 py-3 text-slate-800 text-xs">
                          {message}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

