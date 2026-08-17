import re

def fix(f):
    with open(f, 'r', encoding='utf-8') as file:
        c = file.read()
    
    if "import { Button }" not in c:
        c = c.replace("import { PageHeader }", "import { Button } from '@/components/ui/Button';\nimport { PageHeader }")
    
    with open(f, 'w', encoding='utf-8') as file:
        file.write(c)

for f in ['src/pages/DepartmentRoster.tsx', 'src/pages/TrainingSiteRoster.tsx']:
    fix(f)
