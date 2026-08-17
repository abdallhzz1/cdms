import type { DistributionVersionDetail } from '@/api/distribution';
import { useState } from 'react';
import {
  createAssignment,
  updateAssignment
} from '@/api/distribution';
import type {
  StudentClinicalAssignmentItem
} from '@/api/distribution';

import { ApiError } from '@/api/client';
import { useI18n } from '@/i18n/I18nContext';

interface AssignmentModalProps {
  version: DistributionVersionDetail;
  assignment?: StudentClinicalAssignmentItem | null;
  presetStudentId?: number | null;
  presetStudentName?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function AssignmentModal({
  version,
  assignment,
  presetStudentId,
  presetStudentName,
  onClose,
  onSuccess,
}: AssignmentModalProps) {
  const { t } = useI18n();
  const [studentId, setStudentId] = useState<string>(
    assignment ? String(assignment.student_id) : presetStudentId ? String(presetStudentId) : ''
  );
  const [subgroupId] = useState<string>(
    assignment ? String(assignment.student_subgroup_id) : ''
  );
  const [blockId, setBlockId] = useState<string>(
    assignment ? String(assignment.rotation_block_id) : ''
  );
  const [siteId, setSiteId] = useState<string>(
    assignment ? String(assignment.training_site_id) : ''
  );
  const [supervisorId, setSupervisorId] = useState<string>(
    assignment?.supervisor_id ? String(assignment.supervisor_id) : ''
  );

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, any>>({});
  const [showOverride, setShowOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');

  const isEditing = !!assignment;

  const handleSubmit = async (forceOverride = false) => {
    try {
      setLoading(true);
      setErrors({});

      const payload: any = {
        rotation_block_id: Number(blockId),
        training_site_id: Number(siteId),
        supervisor_id: supervisorId ? Number(supervisorId) : null,
      };

      if (!isEditing) {
        payload.student_id = Number(studentId);
        if (subgroupId) payload.student_subgroup_id = Number(subgroupId);
      }

      if (forceOverride) {
        payload.force = true;
        payload.override_reason = overrideReason;
      }

      if (isEditing) {
        await updateAssignment(version.id, assignment.id, payload);
      } else {
        await createAssignment(version.id, payload);
      }

      onSuccess();
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 422) {
        setErrors(err.errors || {});
        if (err.errors.hard_constraints || err.errors.override_reason) {
          setShowOverride(true);
        }
      } else {
        setErrors({ general: t('state.error.message') });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h3 className="text-lg font-semibold text-slate-900">
            {isEditing ? t('workflow.assignment.edit') : t('workflow.assignment.add')}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 font-bold"
          >
            ✕
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit(false);
          }}
          className="mt-4 space-y-4 text-sm"
        >
          {errors.general && (
            <div className="rounded-md bg-red-50 p-3 text-red-700 text-xs border border-red-200">
              {errors.general}
            </div>
          )}

          {!isEditing && (
            <div>
              <label className="block font-medium text-slate-700">{t('workflow.assignment.student')}</label>
              <input
                type="number"
                disabled={!!presetStudentId}
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder={t('workflow.assignment.studentHint')}
                required
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-xs focus:border-indigo-500 focus:outline-hidden"
              />
              {presetStudentName && (
                <div className="mt-1 text-xs text-indigo-600 font-medium">{presetStudentName}</div>
              )}
            </div>
          )}

          <div>
            <label className="block font-medium text-slate-700">{t('workflow.assignment.block')}</label>
            <select
              value={blockId}
              onChange={(e) => setBlockId(e.target.value)}
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-xs focus:border-indigo-500 focus:outline-hidden"
            >
              <option value="">{t('workflow.assignment.selectBlock')}</option>
              {version.rotation?.blocks?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.start_week}–{b.end_week})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-medium text-slate-700">{t('workflow.assignment.site')}</label>
            <input
              type="number"
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              placeholder={t('workflow.assignment.siteHint')}
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-xs focus:border-indigo-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700">{t('workflow.assignment.supervisor')}</label>
            <input
              type="number"
              value={supervisorId}
              onChange={(e) => setSupervisorId(e.target.value)}
              placeholder={t('workflow.assignment.supervisorHint')}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-xs focus:border-indigo-500 focus:outline-hidden"
            />
          </div>

          {/* Validation Errors & Violations */}
          {errors.hard_constraints && (
            <div className="rounded-md bg-amber-50 p-3 border border-amber-200 space-y-1">
              <div className="font-semibold text-amber-800 text-xs">
                {t('workflow.assignment.ruleViolations')}
              </div>
              <ul className="list-disc ps-4 text-xs text-amber-700 space-y-0.5">
                {Array.isArray(errors.hard_constraints)
                  ? errors.hard_constraints.map((v: any, i: number) => (
                      <li key={i}>{typeof v === 'string' ? v : JSON.stringify(v)}</li>
                    ))
                  : Object.values(errors.hard_constraints).map((v: any, i: number) => (
                      <li key={i}>{String(v)}</li>
                    ))}
              </ul>
            </div>
          )}

          {showOverride && (
            <div className="rounded-md bg-red-50 p-3 border border-red-200 space-y-2">
              <div className="font-semibold text-red-800 text-xs">
                {t('workflow.assignment.overrideRequired')}
              </div>
              <p className="text-xs text-red-600">
                {t('workflow.assignment.overrideDescription')}
              </p>
              <div>
                <textarea
                  rows={2}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder={t('workflow.assignment.overridePlaceholder')}
                  className="w-full rounded-md border border-red-300 p-2 text-xs bg-white focus:outline-hidden"
                  required
                />
              </div>
              <button
                type="button"
                disabled={loading || !overrideReason.trim()}
                onClick={() => handleSubmit(true)}
                className="w-full rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? t('workflow.assignment.submitting') : t('workflow.assignment.confirmOverride')}
              </button>
            </div>
          )}

          {!showOverride && (
            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded-md bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading ? t('workflow.assignment.submitting') : isEditing ? t('common.save') : t('workflow.assignment.create')}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

