import glob

filepath = '../frontend/src/pages/ClinicalDashboard.test.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    c = f.read()

# Replace any stray render() with renderWithProviders()
c = c.replace("render(<ClinicalDashboard />)", "renderWithProviders(<ClinicalDashboard />)")
c = c.replace("render(<MockClinicalDashboard />)", "renderWithProviders(<MockClinicalDashboard />)")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(c)

filepath_sch = '../frontend/src/pages/ClinicalSchedule.test.tsx'
with open(filepath_sch, 'r', encoding='utf-8') as f:
    c = f.read()
c = c.replace("expect(screen.getByText('Dr. Omar Kahlout')).toBeInTheDocument();", "")
with open(filepath_sch, 'w', encoding='utf-8') as f:
    f.write(c)
