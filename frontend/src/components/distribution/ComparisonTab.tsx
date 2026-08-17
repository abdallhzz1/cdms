import type { DistributionVersionDetail } from '@/api/distribution';
import { useState } from 'react';
import { useI18n } from '@/i18n/I18nContext';
import {
  compareVersions
} from '@/api/distribution';
import type {
  VersionComparisonResult
} from '@/api/distribution';


interface ComparisonTabProps {
  version: DistributionVersionDetail;
}

export function ComparisonTab({ version }: ComparisonTabProps) {
  const { t } = useI18n();
  const [targetVersionId, setTargetVersionId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VersionComparisonResult | null>(null);

  const handleCompare = async () => {
    if (!targetVersionId.trim()) return;

    try {
      setLoading(true);
      setError(null);
      const res = await compareVersions(version.id, Number(targetVersionId));
      setResult(res);
    } catch (err: any) {
      setError(err.message || 'Failed to compare versions.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Comparator Bar */}
      <div className="flex flex-col sm:flex-row items-end gap-3 bg-slate-50 p-4 rounded-lg border border-slate-200">
        <div className="flex-1">
          <label className="block text-xs font-semibold text-slate-700">
            {t('comparison.label').replace('{version}', String(version.id))}
          </label>
          <input
            type="number"
            value={targetVersionId}
            onChange={(e) => setTargetVersionId(e.target.value)}
            placeholder={t('comparison.placeholder')}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-xs focus:border-indigo-500 focus:outline-hidden"
          />
        </div>
        <button
          onClick={handleCompare}
          disabled={loading || !targetVersionId.trim()}
          className="rounded-md bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {loading ? t('comparison.loading') : t('comparison.run')}
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-4 text-xs font-medium text-red-800 border border-red-200">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-6">
          {/* Summary Metric Strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <div className="text-[11px] font-medium text-slate-500">{t('comparison.added')}</div>
              <div className="text-lg font-bold text-emerald-600">{result.summary.added}</div>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <div className="text-[11px] font-medium text-slate-500">{t('comparison.removed')}</div>
              <div className="text-lg font-bold text-red-600">{result.summary.removed}</div>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <div className="text-[11px] font-medium text-slate-500">{t('comparison.movedBlock')}</div>
              <div className="text-lg font-bold text-indigo-600">{result.summary.moved_block}</div>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <div className="text-[11px] font-medium text-slate-500">{t('comparison.movedSite')}</div>
              <div className="text-lg font-bold text-indigo-600">{result.summary.moved_site}</div>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <div className="text-[11px] font-medium text-slate-500">{t('comparison.supervisorChanged')}</div>
              <div className="text-lg font-bold text-slate-900">{result.summary.supervisor_changed}</div>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <div className="text-[11px] font-medium text-slate-500">{t('comparison.newlyUnassigned')}</div>
              <div className="text-lg font-bold text-amber-600">{result.summary.newly_unassigned}</div>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <div className="text-[11px] font-medium text-slate-500">{t('comparison.newlyAssigned')}</div>
              <div className="text-lg font-bold text-emerald-600">{result.summary.newly_assigned}</div>
            </div>
          </div>

          {/* Detailed Differences Breakdown */}
          <div className="space-y-4">
            {result.changes.moved_block.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider mb-2">
                  {t('comparison.movedBlocks').replace('{count}', String(result.changes.moved_block.length))}
                </h4>
                <div className="divide-y divide-slate-100 text-xs">
                  {result.changes.moved_block.map((item, idx) => (
                    <div key={idx} className="py-1.5 flex justify-between">
                      <span className="font-medium text-slate-800">Student #{item.student_id}</span>
                      <span className="text-slate-500">
                        Block #{item.from} → Block #{item.to}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.changes.moved_site.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider mb-2">
                  {t('comparison.movedSites').replace('{count}', String(result.changes.moved_site.length))}
                </h4>
                <div className="divide-y divide-slate-100 text-xs">
                  {result.changes.moved_site.map((item, idx) => (
                    <div key={idx} className="py-1.5 flex justify-between">
                      <span className="font-medium text-slate-800">Student #{item.student_id}</span>
                      <span className="text-slate-500">
                        Site #{item.from} → Site #{item.to}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.summary.added === 0 &&
              result.summary.removed === 0 &&
              result.summary.moved_block === 0 &&
              result.summary.moved_site === 0 &&
              result.summary.supervisor_changed === 0 && (
                <div className="rounded-lg border-2 border-dashed border-slate-200 p-8 text-center text-xs text-slate-500">
                  {t('comparison.identical')}
                </div>
              )}
          </div>
        </div>
      )}
    </div>
  );
}

