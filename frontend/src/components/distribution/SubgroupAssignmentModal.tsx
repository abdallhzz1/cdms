import { useMemo, useState } from 'react';
import { AlertTriangle, Building2, CalendarRange, Users, X } from 'lucide-react';
import { ApiError } from '@/api/client';
import {
  createSubgroupAssignment,
  updateSubgroupAssignment,
  type DistributionSubgroupItem,
  type DistributionVersionDetail,
  type SupervisorOption,
  type TrainingSiteOption,
} from '@/api/distribution';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';

interface Props {
  version: DistributionVersionDetail;
  subgroup: DistributionSubgroupItem;
  supervisors: SupervisorOption[];
  onClose: () => void;
  onSuccess: () => void;
}

function errorMessages(error: ApiError): string[] {
  return Object.values(error.errors).flatMap((value) => {
    if (Array.isArray(value)) {
      return value.map((item) => typeof item === 'string' ? item : JSON.stringify(item));
    }
    return [typeof value === 'string' ? value : JSON.stringify(value)];
  });
}

export function SubgroupAssignmentModal({ version, subgroup, supervisors, onClose, onSuccess }: Props) {
  const { locale, t } = useI18n();
  const { can } = useAuth();
  const allocation = subgroup.allocations[0];
  const isEditing = Boolean(allocation);
  const [blockId, setBlockId] = useState(String(allocation?.rotation_block_id ?? ''));
  const [siteId, setSiteId] = useState(String(allocation?.training_site_id ?? ''));
  const [supervisorId, setSupervisorId] = useState(String(allocation?.supervisor_id ?? ''));
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [needsOverride, setNeedsOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');

  const siteOptions = useMemo<TrainingSiteOption[]>(() =>
    (version.rotation.site_capacity_rules ?? [])
      .map((rule) => rule.site)
      .filter((site): site is TrainingSiteOption => Boolean(site)),
  [version.rotation.site_capacity_rules]);

  const supervisorOptions = useMemo(() => {
    if (!siteId) return [];
    return supervisors.filter((person) => Number(person.primary_site_id) === Number(siteId));
  }, [siteId, supervisors]);

  const submit = async (force = false) => {
    if (!blockId || !siteId) return;
    setLoading(true);
    setErrors([]);
    try {
      const payload = {
        rotation_block_id: Number(blockId),
        training_site_id: Number(siteId),
        supervisor_id: supervisorId ? Number(supervisorId) : null,
        ...(force ? { force: true, override_reason: overrideReason.trim() } : {}),
      };
      if (isEditing) {
        await updateSubgroupAssignment(version.id, subgroup.id, payload);
      } else {
        await createSubgroupAssignment(version.id, subgroup.id, payload);
      }
      onSuccess();
    } catch (error) {
      if (error instanceof ApiError) {
        const messages = errorMessages(error);
        setErrors(messages.length ? messages : [error.message]);
        setNeedsOverride(error.status === 422 && ('hard_constraints' in error.errors || 'override_reason' in error.errors));
      } else {
        setErrors([t('state.error.message')]);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-[1px] sm:items-center sm:p-4">
      <div className="max-h-[94vh] w-full overflow-y-auto rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:max-w-xl sm:rounded-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {isEditing ? t('distribution.workspace.editSubgroup') : t('distribution.workspace.assignSubgroup')} — {subgroup.name}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {subgroup.main_group.name} • {t('distribution.workspace.studentsCount').replace('{count}', String(subgroup.student_count))}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={t('common.cancel')}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {errors.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <div className="mb-1 flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4" />{t('distribution.workspace.couldNotSave')}</div>
              <ul className="list-disc space-y-1 ps-5">{errors.map((message, index) => <li key={`${message}-${index}`}>{message}</li>)}</ul>
            </div>
          )}

          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-700"><CalendarRange className="h-4 w-4 text-teal-600" />{t('distribution.workspace.rotationBlock')}</span>
            <select value={blockId} onChange={(event) => setBlockId(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100">
              <option value="">{t('distribution.workspace.selectBlock')}</option>
              {(version.rotation.blocks ?? []).map((block) => (
                <option key={block.id} value={block.id}>
                  {block.name || block.block_code || `#${block.id}`} ({block.from_week ?? block.start_week}–{block.to_week ?? block.end_week})
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-700"><Building2 className="h-4 w-4 text-teal-600" />{t('distribution.workspace.trainingSite')}</span>
            <select value={siteId} onChange={(event) => { setSiteId(event.target.value); setSupervisorId(''); }} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100">
              <option value="">{t('distribution.workspace.selectSite')}</option>
              {siteOptions.map((site) => <option key={site.id} value={site.id}>{locale === 'ar' ? site.name_ar : site.name_en || site.name_ar}</option>)}
            </select>
            {siteOptions.length === 0 && <p className="mt-2 text-xs text-amber-700">{t('distribution.workspace.noConfiguredSites')}</p>}
          </label>

          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-700"><Users className="h-4 w-4 text-teal-600" />{t('distribution.workspace.supervisor')}</span>
            <select value={supervisorId} onChange={(event) => setSupervisorId(event.target.value)} disabled={!siteId} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none disabled:bg-slate-100 focus:border-teal-600 focus:ring-2 focus:ring-teal-100">
              <option value="">{t('distribution.workspace.withoutSupervisor')}</option>
              {supervisorOptions.map((person) => <option key={person.id} value={person.id}>{locale === 'ar' ? person.full_name_ar : person.full_name_en || person.full_name_ar}</option>)}
            </select>
            {siteId && supervisorOptions.length === 0 && <p className="mt-2 text-xs text-slate-500">{t('distribution.workspace.noSiteSupervisors')}</p>}
          </label>

          {needsOverride && can('distribution.override') && (
            <label className="block rounded-xl border border-amber-200 bg-amber-50 p-3">
              <span className="text-xs font-bold text-amber-900">{t('distribution.workspace.overrideReason')}</span>
              <textarea value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} rows={3} className="mt-2 w-full rounded-lg border border-amber-300 bg-white p-2 text-sm outline-none focus:ring-2 focus:ring-amber-200" />
            </label>
          )}
        </div>

        <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50">{t('common.cancel')}</button>
          {needsOverride && can('distribution.override') ? (
            <button type="button" disabled={loading || !overrideReason.trim()} onClick={() => submit(true)} className="rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50">{t('distribution.workspace.saveOverride')}</button>
          ) : (
            <button type="button" disabled={loading || !blockId || !siteId} onClick={() => submit(false)} className="rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-50">{loading ? t('common.loading') : t('common.save')}</button>
          )}
        </div>
      </div>
    </div>
  );
}
