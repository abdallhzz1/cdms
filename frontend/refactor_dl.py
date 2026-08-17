import glob
import re

filepath = 'src/pages/DistributionList.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    c = f.read()

# Replace manual badge logic with StatusBadge
badge_block = """
                  let badge = (
                    <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-600/20 ring-inset">
                      {t('distribution.status.suggested', 'Ù…Ù‚ØªØ±Ø­')}
                    </span>
                  );

                  if (item.is_current && item.status === 'published') {
                    badge = (
                      <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/20 ring-inset">
                        {t('distribution.status.current', 'Ø§Ù„ØªÙˆØ²ÙŠØ¹ Ø§Ù„Ø­Ø§Ù„ÙŠ')}
                      </span>
                    );
                  } else if (item.status === 'published' && !item.is_current) {
                    badge = (
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-500/10 ring-inset">
                        {t('distribution.status.superseded', 'Ù…Ø³ØªØ¨Ø¯Ù„')}
                      </span>
                    );
                  } else if (item.status === 'manual') {
                    badge = (
                      <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-blue-700/10 ring-inset">
                        {t('distribution.status.manual', 'ØªØ¹Ø¯ÙŠÙ„ ÙŠØ¯ÙˆÙŠ')}
                      </span>
                    );
                  }
"""
c = c.replace(badge_block, "")

# Replace <td>{badge}</td>
c = c.replace("<td className=\"whitespace-nowrap px-6 py-4\">{badge}</td>", 
              "<TableCell><StatusBadge status={(item.is_current && item.status === 'published') ? 'current' : (item.status === 'published' && !item.is_current) ? 'superseded' : item.status as any} /></TableCell>")

# Imports
if "import { Button }" not in c:
    c = c.replace("import { Link } from 'react-router-dom';", "import { Link } from 'react-router-dom';\nimport { Button } from '@/components/ui/Button';\nimport { PageHeader } from '@/components/ui/PageHeader';\nimport { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/Table';\nimport { StatusBadge } from '@/components/ui/StatusBadge';")

# Header
old_header = """<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t('distribution.title', 'Ø§Ù„ØªÙˆØ²ÙŠØ¹Ø§Øª Ø§Ù„Ø³Ø±ÙŠØ±ÙŠØ©')}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {t('distribution.subtitle', 'Ø¥Ø¯Ø§Ø±Ø© ÙˆØ¥Ù†Ø´Ø§Ø¡ ÙˆÙ…Ø±Ø§Ø¬Ø¹Ø© ÙˆØ§Ø¹ØªÙ…Ø§Ø¯ Ø§Ù„ØªÙˆØ²ÙŠØ¹Ø§Øª Ø§Ù„Ø®Ø§ØµØ© Ø¨Ø§Ù„Ø·Ù„Ø¨Ø©.')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="block rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
          >
            <option value="">{t('distribution.filters.all', 'Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø­Ø§Ù„Ø§Øª')}</option>
            <option value="published">{t('distribution.status.published', 'Ù…Ù†Ø´ÙˆØ±')}</option>
            <option value="draft">{t('distribution.status.draft', 'Ù…Ø³ÙˆØ¯Ø©')}</option>
            <option value="approved">{t('distribution.status.approved', 'Ù…Ø¹ØªÙ…Ø¯')}</option>
          </select>
          {canCreate && (
            <button
              onClick={() => navigate('/distribution/create')}
              className="inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:w-auto"
            >
              {t('distribution.actions.create', 'Ø¥Ù†Ø´Ø§Ø¡ ØªÙˆØ²ÙŠØ¹ Ø¬Ø¯ÙŠØ¯')}
            </button>
          )}
        </div>
      </div>"""
new_header = """<PageHeader
        title={t('distribution.title', 'Ø§Ù„ØªÙˆØ²ÙŠØ¹Ø§Øª Ø§Ù„Ø³Ø±ÙŠØ±ÙŠØ©')}
        description={t('distribution.subtitle', 'Ø¥Ø¯Ø§Ø±Ø© ÙˆØ¥Ù†Ø´Ø§Ø¡ ÙˆÙ…Ø±Ø§Ø¬Ø¹Ø© ÙˆØ§Ø¹ØªÙ…Ø§Ø¯ Ø§Ù„ØªÙˆØ²ÙŠØ¹Ø§Øª Ø§Ù„Ø®Ø§ØµØ© Ø¨Ø§Ù„Ø·Ù„Ø¨Ø©.')}
      >
        <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="block rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
          >
            <option value="">{t('distribution.filters.all', 'Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø­Ø§Ù„Ø§Øª')}</option>
            <option value="published">{t('distribution.status.published', 'Ù…Ù†Ø´ÙˆØ±')}</option>
            <option value="draft">{t('distribution.status.draft', 'Ù…Ø³ÙˆØ¯Ø©')}</option>
            <option value="approved">{t('distribution.status.approved', 'Ù…Ø¹ØªÙ…Ø¯')}</option>
        </select>
        {canCreate && (
          <Button onClick={() => navigate('/distribution/create')}>
            {t('distribution.actions.create', 'Ø¥Ù†Ø´Ø§Ø¡ ØªÙˆØ²ÙŠØ¹ Ø¬Ø¯ÙŠØ¯')}
          </Button>
        )}
      </PageHeader>"""
c = c.replace(old_header, new_header)

# Table Tags Replace
c = c.replace('<div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">\n          <div className="overflow-x-auto">\n            <table className="min-w-full divide-y divide-slate-200">', '<Table>')
c = c.replace('</table>\n          </div>', '</Table>')
c = c.replace('<thead className="bg-slate-50">', '<TableHeader>')
c = c.replace('</thead>', '</TableHeader>')
c = c.replace('<tbody className="divide-y divide-slate-200 bg-white">', '<TableBody>')
c = c.replace('</tbody>', '</TableBody>')
c = re.sub(r'<tr key=\{([^}]+)\} className="hover:bg-slate-50/80 transition-colors">', r'<TableRow key={\1}>', c)
c = c.replace('<tr>', '<TableRow>')
c = c.replace('</tr>', '</TableRow>')
c = re.sub(r'<th scope="col" className="[^"]+">', r'<TableHead>', c)
c = c.replace('</th>', '</TableHead>')
c = re.sub(r'<td className="whitespace-nowrap px-6 py-4[^"]*">', r'<TableCell>', c)
c = c.replace('</td>', '</TableCell>')
c = c.replace('<th scope="col" className="relative px-6 py-3">', '<TableHead>')

# Paginator buttons
c = c.replace('className="relative inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"', 'variant="outline" size="sm"')
c = c.replace('className="relative ml-3 inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"', 'variant="outline" size="sm" className="ms-3"')
c = c.replace('<button\n                  onClick={() => setPage((p) => Math.max(1, p - 1))}\n                  disabled={page === 1}\n                  variant="outline" size="sm"\n                >', '<Button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} variant="outline" size="sm">')
c = c.replace('<button\n                  onClick={() => setPage((p) => Math.min(data.meta.last_page, p + 1))}\n                  disabled={page === data.meta.last_page}\n                  variant="outline" size="sm" className="ms-3"\n                >', '<Button onClick={() => setPage((p) => Math.min(data.meta.last_page, p + 1))} disabled={page === data.meta.last_page} variant="outline" size="sm" className="ms-3">')
c = c.replace('</button>', '</Button>')

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(c)

print("DistributionList refactored")
