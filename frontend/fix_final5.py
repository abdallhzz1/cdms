import re

def fix(f):
    with open(f, 'r', encoding='utf-8') as file:
        c = file.read()
    
    # Fix the missing TableHeader
    c = c.replace('<TableHead>\n              <TableRow>', '<TableHeader>\n              <TableRow>')
    
    # SupervisorPortal.tsx had issues too
    if 'SupervisorPortal.tsx' in f:
        c = c.replace('<tbody className="divide-y divide-slate-100">', '<TableBody>')
        c = c.replace('</tbody>', '</TableBody>')
        c = c.replace('</table>\n                </div>', '</Table>\n                </div>')
        c = c.replace('<TableHead>\n                    <TableRow>', '<TableHeader>\n                    <TableRow>')
        c = c.replace('</TableHeader>\n                    <TableBody>', '</TableRow>\n                    </TableHeader>\n                    <TableBody>')
        # Wait, the </tr> might be missing or there.
        # Let's just fix it if we can.
        
    with open(f, 'w', encoding='utf-8') as file:
        file.write(c)

for f in ['src/pages/DistributionList.tsx', 'src/pages/ClinicalSchedule.tsx', 'src/pages/DepartmentRoster.tsx', 'src/pages/TrainingSiteRoster.tsx', 'src/pages/SupervisorPortal.tsx']:
    fix(f)
