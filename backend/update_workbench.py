import os

filepath = '../frontend/src/pages/DistributionWorkbench.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace(
    "import { ComparisonTab } from '@/components/distribution/ComparisonTab';",
    "import { ComparisonTab } from '@/components/distribution/ComparisonTab';\nimport { useI18n } from '@/i18n/I18nContext';\nimport { useAuth } from '@/auth/AuthContext';\nimport { LoadingState } from '@/components/ui/LoadingState';\nimport { ErrorState } from '@/components/ui/ErrorState';"
)

c = c.replace(
    "const [loading, setLoading] = useState(true);",
    "const [loading, setLoading] = useState(true);\n  const { t } = useI18n();\n  const { can } = useAuth();"
)

c = c.replace(
    '<div className="flex justify-center items-center py-20">\n        <div className="text-sm font-medium text-slate-500 animate-pulse">Loading Workbench...</div>\n      </div>',
    '<LoadingState message={t(\'common.loading\')} />'
)

c = c.replace(
    '<div className="p-8 text-center text-red-500">\n        Error: {error}\n      </div>',
    '<ErrorState message={error || undefined} onRetry={loadVersion} />'
)

c = c.replace('<span>Version #{version.id}</span>', '<span>{t(\'nav.distribution\')} #{version.id}</span>')
c = c.replace('Academic Year:', '{t(\'distribution.academic_year\', \'العام الأكاديمي\')}:')
c = c.replace('Last Updated:', '{t(\'distribution.last_updated\', \'آخر تحديث\')}:')
c = c.replace('Approve Version', '{t(\'distribution.actions.approve\', \'اعتماد التوزيع\')}')
c = c.replace('Publish Version', '{t(\'distribution.actions.publish\', \'نشر التوزيع\')}')
c = c.replace('>Assignments<', '>{t(\'distribution.tabs.assignments\', \'التعيينات\')}<')
c = c.replace('>Unassigned<', '>{t(\'distribution.tabs.unassigned\', \'غير الموزعين\')}<')
c = c.replace('>Conflicts<', '>{t(\'distribution.tabs.conflicts\', \'التعارضات\')}<')
c = c.replace('>Comparison<', '>{t(\'distribution.tabs.comparison\', \'المقارنة\')}<')
c = c.replace('>Audit History<', '>{t(\'distribution.tabs.audit\', \'سجل التدقيق\')}<')
c = c.replace('>Unassigned Students Warning<', '>{t(\'distribution.warnings.unassigned_title\', \'تحذير: طلبة غير موزعين\')}<')
c = c.replace(
    'There are unassigned students in this rotation. An explicit override reason is required to approve this distribution version.',
    '{t(\'distribution.warnings.unassigned_desc\', \'يوجد طلبة غير موزعين في هذه الدورة. يتطلب الاعتماد إدخال سبب صريح.\')}'
)
c = c.replace('Cancel</button>', '{t(\'common.cancel\', \'إلغاء\')}</button>')
c = c.replace('Confirm Approval</button>', '{t(\'common.confirm\', \'تأكيد\')}</button>')
c = c.replace('Confirm Publication</button>', '{t(\'common.confirm\', \'تأكيد\')}</button>')

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(c)
