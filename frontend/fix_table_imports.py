import re

def fix(f):
    with open(f, 'r', encoding='utf-8') as file:
        c = file.read()
    
    if "import { Table," not in c and "import { Table }" not in c:
        c = c.replace("import { Button }", "import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/Table';\nimport { Button }")
    
    with open(f, 'w', encoding='utf-8') as file:
        file.write(c)

for f in ['src/pages/DepartmentRoster.tsx', 'src/pages/TrainingSiteRoster.tsx']:
    fix(f)
