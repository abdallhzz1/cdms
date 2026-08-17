import glob, re

types = [
    'PaginatedResponse', 'DistributionVersionListItem', 'DistributionVersionDetail',
    'StudentClinicalAssignmentItem', 'AuditLogItem', 'VersionComparisonResult',
    'ClinicalScheduleItem', 'SupervisorAssignment', 'MySupervisorAssignmentsResponse',
    'SupervisorWorkloadItem', 'DepartmentSummary', 'TrainingSiteCapacityItem',
    'TrainingSiteSummary', 'BaseRosterParams', 'DepartmentRosterParams',
    'TrainingSiteRosterParams', 'DashboardSummary', 'DashboardFilters',
    'CreateDistributionVersionData', 'GenerateDistributionData',
    'DistributionConflict', 'DistributionComparison'
]

# Note: We need to find `import { A, B } from '@/api/distribution';` where it could be multiline.
# A regex to match the import statement for api/distribution:
import_re = re.compile(r'import\s+\{([^}]+)\}\s+from\s+[\'"]@/api/distribution[\'"];')

for f in glob.glob('../frontend/src/**/*.tsx', recursive=True) + glob.glob('../frontend/src/**/*.ts', recursive=True):
    if f.endswith('distribution.ts') or f.endswith('api/client.ts'): continue
    
    c = open(f, encoding='utf-8').read()
    matches = import_re.findall(c)
    
    changed = False
    new_c = c
    
    for match in matches:
        # match is the inner content: `getDistributionVersions, DistributionVersionListItem`
        parts = [p.strip() for p in match.split(',')]
        
        normal_imports = []
        type_imports = []
        
        for p in parts:
            if not p: continue
            # handle `import { type Something }` which is valid TS
            is_explicit_type = p.startswith('type ')
            clean_p = p[5:].strip() if is_explicit_type else p
            
            if clean_p in types or is_explicit_type:
                type_imports.append(clean_p)
            else:
                normal_imports.append(clean_p)
                
        if type_imports:
            changed = True
            
            # Reconstruct the import block
            original_block = c[c.find('import {', c.find(match) - 20) : c.find(';', c.find(match)) + 1]
            
            replacement = ""
            if normal_imports:
                replacement += "import {\n  " + ",\n  ".join(normal_imports) + "\n} from '@/api/distribution';\n"
            
            replacement += "import type {\n  " + ",\n  ".join(type_imports) + "\n} from '@/api/distribution';\n"
            
            # Since the same string might appear multiple times or exact whitespace differs, 
            # we just regex replace the specific block we found.
            # But the simplest is to sub using the exact string match if possible.
            # To be safe, we will just use re.sub for this specific match.
            # We must escape the match for regex
            
            safe_match = re.escape(match)
            full_pattern = r'import\s+\{\s*' + safe_match + r'\s*\}\s+from\s+[\'"]@/api/distribution[\'"];'
            new_c = re.sub(full_pattern, replacement, new_c)
            
    if changed:
        # deduplicate multiple empty imports if any were left by previous bugs
        new_c = re.sub(r'import\s+\{\s*\}\s+from\s+[\'"]@/api/distribution[\'"];\n?', '', new_c)
        open(f, 'w', encoding='utf-8').write(new_c)
        print(f"Fixed {f}")
