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

# regex to match from any path ending in api/distribution
import_re = re.compile(r'import\s+\{([^}]+)\}\s+from\s+[\'"].*?api/distribution[\'"];')

for f in glob.glob('../frontend/src/**/*.tsx', recursive=True) + glob.glob('../frontend/src/**/*.ts', recursive=True):
    if f.endswith('distribution.ts') or f.endswith('api/client.ts'): continue
    
    orig_c = open(f, encoding='utf-8').read()
    c = orig_c
    
    # Fix the ['summary'] mistake in WorkbenchSummary.tsx and DistributionWorkbench.tsx
    c = c.replace('summary: [\'summary\'];', 'summary: DistributionVersionDetail[\'summary\'];')
    c = c.replace('summary: ["summary"];', 'summary: DistributionVersionDetail["summary"];')
    c = c.replace('<[\'summary\']>', '<DistributionVersionDetail[\'summary\']>')
    c = c.replace('<["summary"]>', '<DistributionVersionDetail["summary"]>')
    
    # Check if there are TypeScript assigning mistakes in DistributionWorkbench.tsx
    # src/pages/DistributionWorkbench.tsx(205,9): error TS2322: Type '{ total_students: number; assigned_students: number; unassigned_students: number; total_assignments: number; conflicts: number; sites_used: number; blocks_used: number; supervisors_assigned: number; approval_state: { ...; } | null; }' is not assignable to type '["summary"]'.
    c = c.replace('type \'["summary"]\'', 'type \'DistributionVersionDetail["summary"]\'')
    
    # Wait, in DistributionWorkbench.tsx:
    # const summaryData: ["summary"] = { ... }
    # Let's fix that too
    c = re.sub(r':\s*\[[\'"]summary[\'"]\]\s*=', ': DistributionVersionDetail[\'summary\'] =', c)

    matches = import_re.findall(c)
    
    for match in matches:
        parts = [p.strip() for p in match.split(',')]
        normal_imports = []
        type_imports = []
        
        for p in parts:
            if not p: continue
            is_explicit_type = p.startswith('type ')
            clean_p = p[5:].strip() if is_explicit_type else p
            
            if clean_p in types or is_explicit_type:
                if clean_p not in type_imports:
                    type_imports.append(clean_p)
            else:
                if clean_p not in normal_imports:
                    normal_imports.append(clean_p)
                
        if type_imports:
            safe_match = re.escape(match)
            full_pattern = r'import\s+\{\s*' + safe_match + r'\s*\}\s+from\s+([\'"].*?api/distribution[\'"]);'
            
            def replace_imports(m):
                path_str = m.group(1)
                replacement = ""
                if normal_imports:
                    replacement += "import {\n  " + ",\n  ".join(normal_imports) + "\n} from " + path_str + ";\n"
                replacement += "import type {\n  " + ",\n  ".join(type_imports) + "\n} from " + path_str + ";\n"
                return replacement
                
            c = re.sub(full_pattern, replace_imports, c)
            
    if c != orig_c:
        # clean up any leftover empty imports
        c = re.sub(r'import\s+\{\s*\}\s+from\s+[\'"].*?api/distribution[\'"];\n?', '', c)
        open(f, 'w', encoding='utf-8').write(c)
        print(f"Fixed {f}")
