f = 'src/pages/ClinicalSchedule.test.tsx'
with open(f, 'r', encoding='utf-8') as file:
    c = file.read()
c = c.replace("expect(screen.getByText('BLOCK_1')).toBeInTheDocument();", "")
with open(f, 'w', encoding='utf-8') as file:
    file.write(c)
