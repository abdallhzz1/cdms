import glob
import re

filepath = 'src/components/distribution/WorkbenchSummary.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    c = f.read()

# Add Card imports
c = c.replace("import { useI18n } from '@/i18n/I18nContext';", "import { useI18n } from '@/i18n/I18nContext';\nimport { Card, CardContent } from '@/components/ui/Card';")

# Remove unused statusBadge logic
badge_logic = """
  let statusBadge = (
    <span className="inline-flex items-center rounded-md bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-600/20 ring-inset">
      {t('distribution.status.suggested', 'Ù…Ù‚ØªØ±Ø­')}
    </span>
  );

  if (isCurrentPublished) {
    statusBadge = (
      <span className="inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/20 ring-inset">
        {t('distribution.status.current', 'Ø§Ù„ØªÙˆØ²ÙŠØ¹ Ø§Ù„Ø­Ø§Ù„ÙŠ')}
      </span>
    );
  } else if (isSuperseded) {
    statusBadge = (
      <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-500/10 ring-inset">
        {t('distribution.status.superseded', 'Ù…Ø³ØªØ¨Ø¯Ù„')}
      </span>
    );
  } else if (status === 'manual') {
    statusBadge = (
      <span className="inline-flex items-center rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-700/10 ring-inset">
        {t('distribution.status.manual', 'ØªØ¹Ø¯ÙŠÙ„ ÙŠØ¯ÙˆÙŠ')}
      </span>
    );
  } else if (status === 'published') {
    statusBadge = (
      <span className="inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/20 ring-inset">
        {t('distribution.status.published', 'Ù…Ù†Ø´ÙˆØ±')}
      </span>
    );
  }
"""
c = c.replace(badge_logic, "")

# Replace card divs with actual Card
c = re.sub(r'<div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm hover:shadow transition-shadow">\s*<div className="text-xs font-medium text-slate-500">(.*?)</div>\s*<div className="(.*?)">(.*?)</div>\s*</div>',
           r'<Card><CardContent className="p-3"><div className="text-xs font-medium text-slate-500">\1</div><div className="\2">\3</div></CardContent></Card>',
           c)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(c)
