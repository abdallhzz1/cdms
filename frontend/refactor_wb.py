import glob
import re

filepath = 'src/pages/DistributionWorkbench.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    c = f.read()

imports = """import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Form';
import { StatusBadge } from '@/components/ui/StatusBadge';"""

c = c.replace("import { ErrorState } from '@/components/ui/ErrorState';", "import { ErrorState } from '@/components/ui/ErrorState';\n" + imports)

# Refactor Header
old_header = """<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <Link
              to="/distribution"
              className="text-sm font-medium text-slate-500 hover:text-slate-700"
            >
              &larr; {t('common.back', 'Ø±Ø¬ÙˆØ¹')}
            </Link>
            <h1 className="text-xl font-bold text-slate-900">
              Distribution Version #{version.id}
            </h1>
          </div>
          <div className="mt-1 flex items-center gap-4 text-xs text-slate-500">
            <span>Rotation: {version.rotation?.name}</span>
            <span>Created: {new Date(version.created_at).toLocaleDateString()}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchVersionDetails}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            {t('common.refresh', 'ØªØ­Ø¯ÙŠØ«')}
          </button>
          
          {can('distribution.approve') && version.status === 'draft' && (
            <button
              onClick={() => handleApprove(false)}
              disabled={actionLoading}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
            >
              {t('distribution.actions.approve', 'Ø§Ø¹ØªÙ…Ø§Ø¯')}
            </button>
          )}

          {can('distribution.publish') && version.status === 'approved' && !version.is_current_published && (
            <>
              {version.is_superseded && (
                <span className="text-xs font-medium text-amber-600">
                  ØªØ­Ø°ÙŠØ±: ÙŠÙˆØ¬Ø¯ ØªÙˆØ²ÙŠØ¹ Ø­Ø§Ù„ÙŠ Ù…Ù†Ø´ÙˆØ± Ø¨Ø§Ù„Ù Ø¹Ù„.
                </span>
              )}
              <button
                onClick={() => {
                  setOverrideReason('');
                  setPublishModalOpen(true);
                }}
                disabled={actionLoading}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
              >
                {t('distribution.actions.publish', 'Ù†Ø´Ø± Ø§Ù„ØªÙˆØ²ÙŠØ¹')}
              </button>
            </>
          )}
        </div>
      </div>"""

new_header = """<PageHeader
        title={`Distribution Version #${version.id}`}
        description={`Rotation: ${version.rotation?.name} | Created: ${new Date(version.created_at).toLocaleDateString()}`}
      >
          <Button onClick={fetchVersionDetails} variant="outline" size="sm">
            {t('common.refresh', 'ØªØ­Ø¯ÙŠØ«')}
          </Button>
          
          {can('distribution.approve') && version.status === 'draft' && (
            <Button
              onClick={() => handleApprove(false)}
              disabled={actionLoading}
              variant="primary"
              size="sm"
            >
              {t('distribution.actions.approve', 'Ø§Ø¹ØªÙ…Ø§Ø¯')}
            </Button>
          )}

          {can('distribution.publish') && version.status === 'approved' && !version.is_current_published && (
            <>
              {version.is_superseded && (
                <span className="text-xs font-medium text-amber-600">
                  ØªØ­Ø°ÙŠØ±: ÙŠÙˆØ¬Ø¯ ØªÙˆØ²ÙŠØ¹ Ø­Ø§Ù„ÙŠ Ù…Ù†Ø´ÙˆØ± Ø¨Ø§Ù„Ù Ø¹Ù„.
                </span>
              )}
              <Button
                onClick={() => {
                  setOverrideReason('');
                  setPublishModalOpen(true);
                }}
                disabled={actionLoading}
                variant="primary"
                size="sm"
              >
                {t('distribution.actions.publish', 'Ù†Ø´Ø± Ø§Ù„ØªÙˆØ²ÙŠØ¹')}
              </Button>
            </>
          )}
      </PageHeader>"""
c = c.replace(old_header, new_header)

# Rewrite Modals
old_approve_modal = """{approveOverrideOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-base font-semibold text-slate-900">{t('distribution.warnings.unassigned_title', 'ØªØ­Ø°ÙŠØ±: Ø·Ù„Ø¨Ø© ØºÙŠØ± Ù…ÙˆØ²Ø¹ÙŠÙ†')}</h3>
            <p className="text-xs text-slate-600">
              {t('distribution.warnings.unassigned_desc', 'ÙŠÙˆØ¬Ø¯ Ø·Ù„Ø¨Ø© ØºÙŠØ± Ù…ÙˆØ²Ø¹ÙŠÙ† Ù ÙŠ Ù‡Ø°Ù‡ Ø§Ù„Ø¯ÙˆØ±Ø©. ÙŠØªØ·Ù„Ø¨ Ø§Ù„Ø§Ø¹ØªÙ…Ø§Ø¯ Ø¥Ø¯Ø®Ø§Ù„ Ø³Ø¨Ø¨ ØµØ±ÙŠØ­.')}
            </p>
            <div>
              <textarea
                rows={3}
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Specify override reason..."
                className="w-full rounded-md border border-slate-300 p-2 text-xs focus:outline-hidden"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setApproveOverrideOpen(false)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleApprove(true)}
                disabled={actionLoading || !overrideReason.trim()}
                className="rounded-md bg-amber-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {actionLoading ? 'Approving...' : 'Confirm Override Approval'}
              </button>
            </div>
          </div>
        </div>
      )}"""

new_approve_modal = """<Modal
        isOpen={approveOverrideOpen}
        onClose={() => setApproveOverrideOpen(false)}
        title={t('distribution.warnings.unassigned_title', 'ØªØ­Ø°ÙŠØ±: Ø·Ù„Ø¨Ø© ØºÙŠØ± Ù…ÙˆØ²Ø¹ÙŠÙ†')}
        footer={
          <>
            <Button variant="outline" onClick={() => setApproveOverrideOpen(false)}>Cancel</Button>
            <Button 
              variant="warning"
              onClick={() => handleApprove(true)}
              isLoading={actionLoading}
              disabled={!overrideReason.trim()}
            >
              Confirm Override Approval
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600 mb-4">
          {t('distribution.warnings.unassigned_desc', 'ÙŠÙˆØ¬Ø¯ Ø·Ù„Ø¨Ø© ØºÙŠØ± Ù…ÙˆØ²Ø¹ÙŠÙ† Ù ÙŠ Ù‡Ø°Ù‡ Ø§Ù„Ø¯ÙˆØ±Ø©. ÙŠØªØ·Ù„Ø¨ Ø§Ù„Ø§Ø¹ØªÙ…Ø§Ø¯ Ø¥Ø¯Ø®Ø§Ù„ Ø³Ø¨Ø¨ ØµØ±ÙŠØ­.')}
        </p>
        <Input
          type="text"
          value={overrideReason}
          onChange={(e) => setOverrideReason(e.target.value)}
          placeholder="Specify override reason..."
        />
      </Modal>"""
c = c.replace(old_approve_modal, new_approve_modal)
c = c.replace('variant="warning"', 'variant="danger"')

old_publish_modal = """{publishModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-base font-semibold text-slate-900">Publish Distribution Version #{version.id}?</h3>
            <p className="text-xs text-slate-600">
              Publishing will make this clinical distribution official and lock all student placement assignments. This action is immutable.
            </p>

            {version.summary.unassigned_students > 0 && (
              <div className="rounded-md bg-amber-50 p-3 border border-amber-200 space-y-2">
                <div className="text-xs font-semibold text-amber-800">
                  Warning: {version.summary.unassigned_students} unassigned students exist.
                </div>
                <input
                  type="text"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Override reason for unassigned students..."
                  className="w-full rounded-md border border-amber-300 p-1.5 text-xs bg-white focus:outline-hidden"
                />
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setPublishModalOpen(false)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handlePublish(version.summary.unassigned_students > 0)}
                disabled={actionLoading || (version.summary.unassigned_students > 0 && !overrideReason.trim())}
                className="rounded-md bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {actionLoading ? 'Publishing...' : 'Confirm & Publish'}
              </button>
            </div>
          </div>
        </div>
      )}"""
new_publish_modal = """<Modal
        isOpen={publishModalOpen}
        onClose={() => setPublishModalOpen(false)}
        title={`Publish Distribution Version #${version.id}?`}
        footer={
          <>
            <Button variant="outline" onClick={() => setPublishModalOpen(false)}>Cancel</Button>
            <Button 
              variant="primary"
              onClick={() => handlePublish(version.summary.unassigned_students > 0)}
              isLoading={actionLoading}
              disabled={version.summary.unassigned_students > 0 && !overrideReason.trim()}
            >
              Confirm & Publish
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600 mb-4">
          Publishing will make this clinical distribution official and lock all student placement assignments. This action is immutable.
        </p>
        {version.summary.unassigned_students > 0 && (
          <div className="rounded-md bg-amber-50 p-3 border border-amber-200 space-y-2 mb-4">
            <div className="text-xs font-semibold text-amber-800">
              Warning: {version.summary.unassigned_students} unassigned students exist.
            </div>
            <Input
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Override reason for unassigned students..."
            />
          </div>
        )}
      </Modal>"""
c = c.replace(old_publish_modal, new_publish_modal)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(c)

print("Workbench refactored")
