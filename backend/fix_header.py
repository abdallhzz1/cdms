import os
filepath = '../frontend/src/components/layout/Header.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    c = f.read()
c = c.replace('<p className="text-xs font-medium text-slate-500">', '<p data-testid="admin-badge" className="text-xs font-medium text-slate-500">')
with open(filepath, 'w', encoding='utf-8') as f:
    f.write(c)
