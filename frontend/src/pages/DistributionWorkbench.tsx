import type { DistributionVersionDetail } from '@/api/distribution';
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getDistributionVersion,
  approveVersion,
  publishVersion,
  
} from '@/api/distribution';
import { ApiError } from '@/api/client';
import { WorkbenchSummary } from '@/components/distribution/WorkbenchSummary';
import { AssignmentsTab } from '@/components/distribution/AssignmentsTab';
import { UnassignedTab } from '@/components/distribution/UnassignedTab';
import { ConflictsTab } from '@/components/distribution/ConflictsTab';
import { AuditHistoryTab } from '@/components/distribution/AuditHistoryTab';
import { ComparisonTab } from '@/components/distribution/ComparisonTab';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/auth/AuthContext';
import { LoadingState } from '@/components/ui/LoadingState';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Form';

type TabType = 'assignments' | 'unassigned' | 'conflicts' | 'comparison' | 'audit';

export function DistributionWorkbench() {
  const { versionId } = useParams<{ versionId: string }>();
  const id = Number(versionId);

  const [version, setVersion] = useState<DistributionVersionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const { t } = useI18n();
  const { can } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('assignments');

  // Approval / Publish action states
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal states for override during approve/publish
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [approveOverrideOpen, setApproveOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');

  const fetchVersionDetails = async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const res = await getDistributionVersion(id);
      setVersion(res);
    } catch (err: any) {
      setError(t('state.error.message'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVersionDetails();
  }, [id]);

  const handleApprove = async (forceOverride = false) => {
    if (!version) return;

    try {
      setActionLoading(true);
      setActionMessage(null);

      await approveVersion(version.id, forceOverride ? { force: true, override_reason: overrideReason } : undefined);

      setActionMessage({ type: 'success', text: t('workflow.workbench.approved') });
      setApproveOverrideOpen(false);
      setOverrideReason('');
      fetchVersionDetails();
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 422) {
        if (err.errors.unassigned || err.errors.override_reason) {
          setApproveOverrideOpen(true);
        } else {
          setActionMessage({ type: 'error', text: t('state.error.message') });
        }
      } else {
        setActionMessage({ type: 'error', text: t('state.error.message') });
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handlePublish = async (forceOverride = false) => {
    if (!version) return;

    try {
      setActionLoading(true);
      setActionMessage(null);

      await publishVersion(version.id, {
        last_updated_at: version.updated_at,
        force: forceOverride,
        override_reason: forceOverride ? overrideReason : undefined,
      });

      setActionMessage({ type: 'success', text: t('workflow.workbench.published') });
      setPublishModalOpen(false);
      setOverrideReason('');
      fetchVersionDetails();
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 422) {
        if (err.errors.concurrency) {
          setActionMessage({
            type: 'error',
            text: t('workflow.workbench.changed'),
          });
          setPublishModalOpen(false);
        } else if (err.errors.unassigned || err.errors.override_reason) {
          // Keep modal open for override reason entry
          setActionMessage({ type: 'error', text: t('workflow.workbench.overrideRequired') });
        } else {
          setActionMessage({ type: 'error', text: t('state.error.message') });
        }
      } else {
        setActionMessage({ type: 'error', text: t('state.error.message') });
      }
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <LoadingState message={t('common.loading')} />
    );
  }

  if (error || !version) {
    return (
      <div className="space-y-4">
        <Link to="/distribution" className="text-xs font-semibold text-indigo-600 hover:text-indigo-900">
          ← {t('workflow.workbench.back')}
        </Link>
        <div className="rounded-md bg-red-50 p-4 border border-red-200 text-sm font-medium text-red-800">
          {error || t('workflow.workbench.unavailable')}
        </div>
      </div>
    );
  }

  const isEditable = version.status !== 'published';

  return (
    <div className="space-y-6">
      {/* Top Header & Action Bar */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Link to="/distribution" className="hover:text-slate-800 font-medium">
              {t('workflow.workbench.distributions')}
            </Link>
            <span>/</span>
            <span>{t('nav.distribution')} #{version.id}</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            {version.rotation?.name} (Level {version.rotation?.academic_level})
          </h1>
          <div className="mt-1 text-xs text-slate-500">
            {t('distribution.academic_year', 'العام الأكاديمي')}: {version.rotation?.academic_year?.name || 'N/A'} • {t('distribution.last_updated', 'آخر تحديث')}:{' '}
            {new Date(version.updated_at).toLocaleString()}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isEditable && (
            <>
              {can('distribution.approve') && (
              <button
                onClick={() => handleApprove(false)}
                disabled={actionLoading}
                className="rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                {t('distribution.actions.approve', 'اعتماد التوزيع')}
              </button>
            )}

              <button
                onClick={() => setPublishModalOpen(true)}
                disabled={actionLoading || !version.summary.approval_state}
                title={!version.summary.approval_state ? t('workflow.workbench.approvalRequired') : ''}
                className="rounded-md bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {t('distribution.actions.publish', 'نشر التوزيع')}
              </button>
            </>
          )}
        </div>
      </div>

      {actionMessage && (
        <div
          className={`rounded-md p-4 text-xs font-medium border ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          {actionMessage.text}
        </div>
      )}

      {/* Summary Metrics */}
      <WorkbenchSummary
        summary={version.summary}
        isCurrentPublished={version.is_current_published}
        isSuperseded={version.is_superseded}
        status={version.status}
      />

      {/* Navigation Tabs */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex space-x-6">
          <button
            onClick={() => setActiveTab('assignments')}
            className={`border-b-2 py-3 px-1 text-xs font-semibold ${
              activeTab === 'assignments'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
            }`}
          >
            {t('workflow.workbench.assignments')} ({version.summary.assigned_students})
          </button>

          <button
            onClick={() => setActiveTab('unassigned')}
            className={`border-b-2 py-3 px-1 text-xs font-semibold ${
              activeTab === 'unassigned'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
            }`}
          >
            {t('workflow.workbench.unassigned')} ({version.summary.unassigned_students})
          </button>

          <button
            onClick={() => setActiveTab('conflicts')}
            className={`border-b-2 py-3 px-1 text-xs font-semibold ${
              activeTab === 'conflicts'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
            }`}
          >
            {t('workflow.workbench.conflicts')} ({version.summary.conflicts})
          </button>

          <button
            onClick={() => setActiveTab('comparison')}
            className={`border-b-2 py-3 px-1 text-xs font-semibold ${
              activeTab === 'comparison'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
            }`}
          >
            {t('workflow.workbench.comparison')}
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`border-b-2 py-3 px-1 text-xs font-semibold ${
              activeTab === 'audit'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
            }`}
          >
            {t('workflow.workbench.audit')}
          </button>
        </nav>
      </div>

      {/* Tab Panels */}
      <div className="pt-2">
        {activeTab === 'assignments' && (
          <AssignmentsTab version={version} onRefresh={fetchVersionDetails} />
        )}
        {activeTab === 'unassigned' && (
          <UnassignedTab version={version} onRefresh={fetchVersionDetails} />
        )}
        {activeTab === 'conflicts' && <ConflictsTab version={version} />}
        {activeTab === 'comparison' && <ComparisonTab version={version} />}
        {activeTab === 'audit' && <AuditHistoryTab version={version} />}
      </div>

      {/* Approval Override Modal */}
      {approveOverrideOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-base font-semibold text-slate-900">{t('distribution.warnings.unassigned_title', 'تحذير: طلبة غير موزعين')}</h3>
            <p className="text-xs text-slate-600">
              {t('distribution.warnings.unassigned_desc', 'يوجد طلبة غير موزعين في هذه الدورة. يتطلب الاعتماد إدخال سبب صريح.')}
            </p>
            <div>
              <textarea
                rows={3}
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder={t('workflow.workbench.overridePlaceholder')}
                className="w-full rounded-md border border-slate-300 p-2 text-xs focus:outline-hidden"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setApproveOverrideOpen(false)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => handleApprove(true)}
                disabled={actionLoading || !overrideReason.trim()}
                className="rounded-md bg-amber-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {actionLoading ? t('workflow.workbench.approving') : t('workflow.workbench.confirmApproval')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Publish Confirmation Modal */}
      <Modal
        isOpen={publishModalOpen}
        onClose={() => setPublishModalOpen(false)}
        title={t('workflow.workbench.publishTitle')}
        footer={
          <>
            <Button variant="outline" onClick={() => setPublishModalOpen(false)}>{t('common.cancel')}</Button>
            <Button 
              variant="primary"
              onClick={() => handlePublish(version.summary.unassigned_students > 0)}
              isLoading={actionLoading}
              disabled={version.summary.unassigned_students > 0 && !overrideReason.trim()}
            >
              {t('workflow.workbench.publishConfirm')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600 mb-4">
          {t('workflow.workbench.publishDescription')}
        </p>
        {version.summary.unassigned_students > 0 && (
          <div className="rounded-md bg-amber-50 p-3 border border-amber-200 space-y-2 mb-4">
            <div className="text-xs font-semibold text-amber-800">
              {t('workflow.workbench.publishWarning').replace('{count}', String(version.summary.unassigned_students))}
            </div>
            <Input
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder={t('workflow.workbench.overridePlaceholder')}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}

