import re

def fix(f):
    with open(f, 'r', encoding='utf-8') as file:
        c = file.read()
    
    # Fix stray </tr>
    c = c.replace('</TableRow>\n                </tr>\n                </TableHeader>', '</TableRow>\n                </TableHeader>')
    
    # Fix missing </Table> in rosters
    c = re.sub(r'</TableBody>(\s*)</div>', r'</TableBody>\1</Table>\1</div>', c)

    with open(f, 'w', encoding='utf-8') as file:
        file.write(c)

for f in ['src/pages/DistributionList.tsx', 'src/pages/ClinicalSchedule.tsx', 'src/pages/DepartmentRoster.tsx', 'src/pages/TrainingSiteRoster.tsx', 'src/pages/SupervisorPortal.tsx']:
    fix(f)
