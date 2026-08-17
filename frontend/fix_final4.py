import re

def fix(f):
    with open(f, 'r', encoding='utf-8') as file:
        c = file.read()
    
    # 1. In DL and Schedule, wrap the Table and paginator in <> </> if they aren't.
    # Currently it's:
    #      ) : (
    #        <Table>
    #        ...
    #        </Table>
    #        {data && data.meta && data.meta.last_page > 1 && (
    
    # Let's just find `) : (\n        <Table>` and replace with `) : (\n        <>\n        <Table>`
    c = c.replace(') : (\n        <Table>', ') : (\n        <>\n        <Table>')
    
    # Then close it before the end of the return statement
    # Let's do it manually since the paginator ends differently.
    if 'DistributionList' in f:
        c = c.replace('          )}\n        </div>\n      )}', '          )}\n        </div>\n        </>\n      )}')
    elif 'ClinicalSchedule' in f:
        c = c.replace('          )}\n    </div>\n  );\n}', '          )}\n        </>\n      )}\n    </div>\n  );\n}')

    # 2. Fix the TableHead mismatch in DepartmentRoster and TrainingSiteRoster
    # In DepartmentRoster and TrainingSiteRoster, line 194 is `</TableHeader>`
    # But line 185 is `<TableHead>`. It used to be `<thead className="bg-slate-50">`
    # Let's just blindly replace `<TableHead>\n                <TableRow>\n                  <TableHead>`
    # with `<TableHeader>\n                <TableRow>\n                  <TableHead>`
    c = c.replace('<TableHead>\n                <TableRow>\n                  <TableHead>', '<TableHeader>\n                <TableRow>\n                  <TableHead>')
    # Same for Univ. Number
    c = c.replace('<TableHead>\n                <TableRow>\n                  <TableHead>Univ. Number</TableHead>', '<TableHeader>\n                <TableRow>\n                  <TableHead>Univ. Number</TableHead>')
    
    with open(f, 'w', encoding='utf-8') as file:
        file.write(c)

for f in ['src/pages/DistributionList.tsx', 'src/pages/ClinicalSchedule.tsx', 'src/pages/DepartmentRoster.tsx', 'src/pages/TrainingSiteRoster.tsx']:
    fix(f)
