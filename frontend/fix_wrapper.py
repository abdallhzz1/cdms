def fix(f):
    with open(f, 'r', encoding='utf-8') as file:
        c = file.read()
    
    c = c.replace(') : (\n        <>\n        <Table>', ') : (\n        <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">\n        <Table>')
    c = c.replace('\n        </>\n      )}', '\n      )}')

    with open(f, 'w', encoding='utf-8') as file:
        file.write(c)

fix('src/pages/DistributionList.tsx')
fix('src/pages/ClinicalSchedule.tsx')
