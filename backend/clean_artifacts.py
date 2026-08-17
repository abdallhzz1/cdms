import os

def replace_in_file(filepath, old, new):
    if not os.path.exists(filepath): return
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    content = content.replace(old, new)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

# Fix AssignmentsTab.tsx
assignments_tab = '../frontend/src/components/distribution/AssignmentsTab.tsx'
replace_in_file(assignments_tab, 'Block #${item.rotation_block_id}', 'فترة #${item.rotation_block_id}')
replace_in_file(assignments_tab, 'Site #${item.training_site_id}', 'موقع #${item.training_site_id}')

# Fix TrainingSiteRoster.tsx
site_roster = '../frontend/src/pages/TrainingSiteRoster.tsx'
replace_in_file(site_roster, "return <div style={{ padding: '24px', textAlign: 'center' }}>Loading...</div>;", "return <div className=\"p-8 text-center text-slate-500\">جاري التحميل...</div>;")

# Fix DepartmentRoster.tsx
dept_roster = '../frontend/src/pages/DepartmentRoster.tsx'
replace_in_file(dept_roster, "return <div style={{ padding: '24px', textAlign: 'center' }}>Loading...</div>;", "return <div className=\"p-8 text-center text-slate-500\">جاري التحميل...</div>;")

print("Cleaned up remaining developer artifacts in the frontend.")
