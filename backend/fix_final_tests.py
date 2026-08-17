import glob

filepath = '../frontend/src/pages/ClinicalDashboard.test.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace("import { renderWithProviders as render, renderWithProviders } from '@/test/renderWithProviders';", "import { render } from '@testing-library/react';")
c = c.replace("renderWithProviders(", "render(")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(c)

filepath_sch = '../frontend/src/pages/ClinicalSchedule.test.tsx'
with open(filepath_sch, 'r', encoding='utf-8') as f:
    c = f.read()
# Let's just use re to replace empty waitFor
import re
c = re.sub(r'await waitFor\(\(\) => \{\s*\}\);', "await waitFor(() => { expect(screen.getByText('Al-Ahli Hospital')).toBeInTheDocument(); });", c)
with open(filepath_sch, 'w', encoding='utf-8') as f:
    f.write(c)
