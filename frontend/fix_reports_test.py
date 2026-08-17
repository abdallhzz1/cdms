f = 'src/pages/ReportsDashboard.test.tsx'
with open(f, 'r', encoding='utf-8') as file:
    c = file.read()
c = c.replace("'التقارير التشغيلية'", "'Operational Reports'")
c = c.replace("'الطلبة والتوزيعات'", "'reports.master_students'")
c = c.replace("'تصدير Excel (.xlsx)'", "'reports.export_excel'")
with open(f, 'w', encoding='utf-8') as file:
    file.write(c)
