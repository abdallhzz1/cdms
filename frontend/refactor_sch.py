import glob
import re

filepath = 'src/pages/ClinicalSchedule.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    c = f.read()

imports = """import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Form';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/Table';"""
c = c.replace("import { ErrorState } from '@/components/ui/ErrorState';", "import { ErrorState } from '@/components/ui/ErrorState';\n" + imports)

# Header
old_header = """<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {t('nav.schedule', 'Ø§Ù„Ø¬Ø¯ÙˆÙ„ Ø§Ù„Ø³Ø±ÙŠØ±ÙŠ')}
            </h1>
            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
              {t('distribution.status.current', 'Ø§Ù„ØªÙˆØ²ÙŠØ¹ Ø§Ù„Ø­Ø§Ù„ÙŠ')}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {t('schedule.description', 'Ø¹Ø±Ø¶ Ø§Ù„ØªØ¹ÙŠÙŠÙ†Ø§Øª Ø§Ù„Ø³Ø±ÙŠØ±ÙŠØ© Ø§Ù„Ù…Ø¹ØªÙ…Ø¯Ø© Ù„Ù„Ø·Ù„Ø¨Ø©')}
          </p>
        </div>
      </div>"""
new_header = """<PageHeader
        title={t('nav.schedule', 'Ø§Ù„Ø¬Ø¯ÙˆÙ„ Ø§Ù„Ø³Ø±ÙŠØ±ÙŠ')}
        description={t('schedule.description', 'Ø¹Ø±Ø¶ Ø§Ù„ØªØ¹ÙŠÙŠÙ†Ø§Øª Ø§Ù„Ø³Ø±ÙŠØ±ÙŠØ© Ø§Ù„Ù…Ø¹ØªÙ…Ø¯Ø© Ù„Ù„Ø·Ù„Ø¨Ø©')}
      >
        <StatusBadge status="current" />
      </PageHeader>"""
c = c.replace(old_header, new_header)

# Search form
old_search = """<form onSubmit={handleSearch} className="flex flex-1 max-w-lg gap-2">
          <input
            type="text"
            placeholder={t('common.search', 'Ø§Ø¨Ø­Ø«...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
          />
          <button
            type="submit"
            className="rounded-md bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm border border-slate-300 hover:bg-slate-50 focus:outline-none"
          >
            {t('common.search', 'Ø¨Ø­Ø«')}
          </button>
        </form>"""
new_search = """<form onSubmit={handleSearch} className="flex flex-1 max-w-lg gap-2">
          <Input
            type="text"
            placeholder={t('common.search', 'Ø§Ø¨Ø­Ø«...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button type="submit" variant="outline">
            {t('common.search', 'Ø¨Ø­Ø«')}
          </Button>
        </form>"""
c = c.replace(old_search, new_search)

# Table
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

# Paginator buttons
c = c.replace('className="relative inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"', 'variant="outline" size="sm"')
c = c.replace('<button\n                  onClick={() => setPage(p => Math.max(1, p - 1))}\n                  disabled={page === 1}\n                  variant="outline" size="sm"\n                >', '<Button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} variant="outline" size="sm">')
c = c.replace('<button\n                  onClick={() => setPage(p => Math.min(scheduleData.meta?.last_page, p + 1))}\n                  disabled={page === scheduleData.meta?.last_page}\n                  variant="outline" size="sm"\n                >', '<Button onClick={() => setPage(p => Math.min(scheduleData.meta?.last_page, p + 1))} disabled={page === scheduleData.meta?.last_page} variant="outline" size="sm">')
c = c.replace('</button>', '</Button>')


with open(filepath, 'w', encoding='utf-8') as f:
    f.write(c)
print("Schedule refactored")
