import glob
import re

filepath = 'src/pages/ClinicalDashboard.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    c = f.read()

# Add imports
imports = """import { PageHeader, SectionHeader } from '@/components/ui/PageHeader';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';"""
c = c.replace("import { Link } from 'react-router-dom';", "import { Link } from 'react-router-dom';\n" + imports)

# Refactor Header
old_header = """<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {t('dashboard.title', 'Ù†Ø¸Ø§Ù… Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„ØªØ¯Ø±ÙŠØ¨ Ø§Ù„Ø³Ø±ÙŠØ±ÙŠ')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t('dashboard.subtitle', 'Ù„ÙˆØ­Ø© Ø§Ù„ØªØ­ÙƒÙ…')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {meta?.generated_at && (
            <span className="text-xs text-slate-500 hidden sm:inline-block">
              {t('distribution.last_updated', 'Ø¢Ø®Ø± ØªØ­Ø¯ÙŠØ«')}: {new Date(meta.generated_at).toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
          >
            {isFetching ? t('common.loading', 'Ø¬Ø§Ø±ÙŠ Ø§Ù„ØªØ­Ù…ÙŠÙ„...') : t('common.refresh', 'ØªØ­Ø¯ÙŠØ«')}
          </button>
        </div>
      </div>"""
new_header = """<PageHeader
        title={t('dashboard.title', 'Ù†Ø¸Ø§Ù… Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„ØªØ¯Ø±ÙŠØ¨ Ø§Ù„Ø³Ø±ÙŠØ±ÙŠ')}
        description={t('dashboard.subtitle', 'Ù„ÙˆØ­Ø© Ø§Ù„ØªØ­ÙƒÙ…')}
      >
        {meta?.generated_at && (
            <span className="text-xs text-slate-500 hidden sm:inline-block">
              {t('distribution.last_updated', 'Ø¢Ø®Ø± ØªØ­Ø¯ÙŠØ«')}: {new Date(meta.generated_at).toLocaleTimeString()}
            </span>
        )}
        <Button onClick={() => refetch()} isLoading={isFetching} variant="outline">
          {t('common.refresh', 'ØªØ­Ø¯ÙŠØ«')}
        </Button>
      </PageHeader>"""
c = c.replace(old_header, new_header)

# Refactor Needs Attention section
old_needs_attention = """<h2 className="text-base font-semibold text-slate-900 mb-4">{t('dashboard.needs_attention', 'ÙŠØ­ØªØ§Ø¬ Ø¥Ù„Ù‰ Ø§Ù†ØªØ¨Ø§Ù‡Ùƒ')}</h2>"""
new_needs_attention = """<SectionHeader title={t('dashboard.needs_attention', 'ÙŠØ­ØªØ§Ø¬ Ø¥Ù„Ù‰ Ø§Ù†ØªØ¨Ø§Ù‡Ùƒ')} />"""
c = c.replace(old_needs_attention, new_needs_attention)

# Refactor Overview section
old_overview = """<h2 className="text-base font-semibold text-slate-900 mb-4">{t('dashboard.overview', 'Ù†Ø¸Ø±Ø© Ø¹Ø§Ù…Ø©')}</h2>"""
new_overview = """<SectionHeader title={t('dashboard.overview', 'Ù†Ø¸Ø±Ø© Ø¹Ø§Ù…Ø©')} />"""
c = c.replace(old_overview, new_overview)

# Refactor Quick Actions section
old_quick_actions = """<h2 className="text-base font-semibold text-slate-900 mb-4">{t('dashboard.quick_actions', 'Ø¥Ø¬Ø±Ø§Ø¡Ø§Øª Ø³Ø±ÙŠØ¹Ø©')}</h2>"""
new_quick_actions = """<SectionHeader title={t('dashboard.quick_actions', 'Ø¥Ø¬Ø±Ø§Ø¡Ø§Øª Ø³Ø±ÙŠØ¹Ø©')} />"""
c = c.replace(old_quick_actions, new_quick_actions)

# Update KPI Cards
c = re.sub(r'<div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">\s*<dt className="text-xs font-medium text-slate-500 truncate">(.*?)</dt>\s*<dd className="mt-1 text-2xl font-bold (.*?)">(.*?)</dd>\s*</div>',
           r'<Card><CardContent className="p-4"><dt className="text-xs font-medium text-slate-500 truncate">\1</dt><dd className="mt-1 text-2xl font-bold \2">\3</dd></CardContent></Card>',
           c)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(c)
print("Dashboard refactored")
