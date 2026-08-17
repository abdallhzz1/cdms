def fix(f, old, new):
    with open(f, 'r', encoding='utf-8') as file:
        c = file.read()
    c = c.replace(old, new)
    with open(f, 'w', encoding='utf-8') as file:
        file.write(c)

fix('src/pages/TrainingSiteRoster.test.tsx', "'Al-Ahli Hospital Roster'", "/Al-Ahli Hospital/i")
fix('src/pages/DepartmentRoster.test.tsx', "'Internal Medicine Roster'", "/Internal Medicine/i")
