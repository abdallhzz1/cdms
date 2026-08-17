import os

filepath = '../frontend/src/pages/DistributionWorkbench.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace(
    '<button\n                onClick={() => handleApprove(false)}\n                disabled={actionLoading}\n                className="rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50 transition-colors"\n              >\n                {t(\'distribution.actions.approve\', \'اعتماد التوزيع\')}\n              </button>',
    '{can(\'distribution.approve\') && (\n              <button\n                onClick={() => handleApprove(false)}\n                disabled={actionLoading}\n                className="rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50 transition-colors"\n              >\n                {t(\'distribution.actions.approve\', \'اعتماد التوزيع\')}\n              </button>\n            )}'
)

c = c.replace(
    '<button\n                onClick={() => setPublishModalOpen(true)}\n                disabled={actionLoading}\n                className="rounded-md bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-500 disabled:opacity-50 transition-colors"\n              >\n                {t(\'distribution.actions.publish\', \'نشر التوزيع\')}\n              </button>',
    '{can(\'distribution.publish\') && (\n              <button\n                onClick={() => setPublishModalOpen(true)}\n                disabled={actionLoading}\n                className="rounded-md bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-500 disabled:opacity-50 transition-colors"\n              >\n                {t(\'distribution.actions.publish\', \'نشر التوزيع\')}\n              </button>\n            )}'
)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(c)
