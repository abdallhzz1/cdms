import re

def fix(f):
    with open(f, 'r', encoding='utf-8') as file:
        c = file.read()
    
    # 1. Remove all stray </tr>
    c = c.replace('</tr>\n                </TableHeader>', '</TableHeader>')
    c = c.replace('</tr>\n              </TableHeader>', '</TableHeader>')
    
    # 2. Fix <table className="..."> to <Table>
    c = re.sub(r'<table[^>]*>', r'<Table>', c)

    # 3. Ensure TableHead is closed. If there's an issue with TableHead not matching TableHeader,
    # it means a TableHead was never closed. Let's make sure. 
    # Actually wait, the error is "Unexpected closing TableHeader tag does not match opening TableHead tag".
    # This means a TableHead is missing a closing tag! Let's find it.
    
    with open(f, 'w', encoding='utf-8') as file:
        file.write(c)

for f in ['src/pages/DistributionList.tsx', 'src/pages/ClinicalSchedule.tsx', 'src/pages/DepartmentRoster.tsx', 'src/pages/TrainingSiteRoster.tsx']:
    fix(f)

# For the TableHead issue: Let's do a quick print to check for unclosed TableHead tags.
import glob
for f in ['src/pages/DepartmentRoster.tsx', 'src/pages/TrainingSiteRoster.tsx']:
    with open(f, 'r', encoding='utf-8') as file:
        lines = file.readlines()
        for i, line in enumerate(lines):
            if 'TableHead' in line and '</TableHead>' not in line and 'import' not in line:
                print(f"{f}:{i+1} - {line.strip()}")
