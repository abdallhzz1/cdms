f = 'src/pages/ClinicalDashboard.tsx'
with open(f, 'r', encoding='utf-8') as file:
    c = file.read()
c = c.replace("import { ErrorState } from '@/components/ui/ErrorState';", "import { ErrorState } from '@/components/ui/ErrorState';\nimport { EmptyState } from '@/components/ui/EmptyState';")
with open(f, 'w', encoding='utf-8') as file:
    file.write(c)
