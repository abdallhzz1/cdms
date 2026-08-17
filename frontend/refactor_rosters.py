import glob
import re

files = ['src/pages/SupervisorPortal.tsx', 'src/pages/DepartmentRoster.tsx', 'src/pages/TrainingSiteRoster.tsx']
for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        c = file.read()
    
    imports = "import { PageHeader } from '@/components/ui/PageHeader';\nimport { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/Table';\nimport { Button } from '@/components/ui/Button';\n"
    
    if 'import { Table }' not in c:
        c = c.replace("import { ErrorState } from '@/components/ui/ErrorState';", "import { ErrorState } from '@/components/ui/ErrorState';\n" + imports)
    
    # Table replacement
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
    
    # Replace buttons in pagination
    c = c.replace('className="relative inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"', 'variant="outline" size="sm"')
    
    c = c.replace('<button\n                  onClick={() => setPage(p => Math.max(1, p - 1))}\n                  disabled={page === 1}\n                  variant="outline" size="sm"\n                >', '<Button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} variant="outline" size="sm">')
    c = c.replace('<button\n                  onClick={() => setPage(p => Math.min(rosterData.meta?.last_page, p + 1))}\n                  disabled={page === rosterData.meta?.last_page}\n                  variant="outline" size="sm"\n                >', '<Button onClick={() => setPage(p => Math.min(rosterData.meta?.last_page, p + 1))} disabled={page === rosterData.meta?.last_page} variant="outline" size="sm">')
    c = c.replace('<button\n                  onClick={() => setPage(p => Math.min(data.meta?.last_page, p + 1))}\n                  disabled={page === data.meta?.last_page}\n                  variant="outline" size="sm"\n                >', '<Button onClick={() => setPage(p => Math.min(data.meta?.last_page, p + 1))} disabled={page === data.meta?.last_page} variant="outline" size="sm">')
    c = c.replace('</button>', '</Button>')

    with open(f, 'w', encoding='utf-8') as file:
        file.write(c)

print('Rosters refactored')
