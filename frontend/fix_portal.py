f = 'src/pages/SupervisorPortal.tsx'
with open(f, 'r', encoding='utf-8') as file:
    c = file.read()
c = c.replace('</table>', '</Table>')
c = c.replace('<table className="min-w-full divide-y divide-slate-100">', '<Table>')
with open(f, 'w', encoding='utf-8') as file:
    file.write(c)
