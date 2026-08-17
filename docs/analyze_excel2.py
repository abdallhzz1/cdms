import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import zipfile
import xml.etree.ElementTree as ET

xlsx_path = r'D:\react\hebron\cdms\docs\reference\بيانات_الدائرة_السريرية_الشاملة (1).xlsx'

def get_shared_strings(z):
    ss_xml = z.read('xl/sharedStrings.xml')
    root = ET.fromstring(ss_xml)
    ns = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    strings = []
    for si in root.findall('.//ns:si', ns):
        texts = si.findall('.//ns:t', ns)
        val = ''.join(t.text or '' for t in texts)
        strings.append(val)
    return strings

def get_sheet_data(z, sheet_idx, shared_strings, max_rows=10):
    xml_data = z.read(f'xl/worksheets/sheet{sheet_idx}.xml')
    root = ET.fromstring(xml_data)
    ns = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    rows = root.findall('.//ns:row', ns)
    result = []
    for row in rows[:max_rows]:
        row_data = []
        for cell in row.findall('ns:c', ns):
            t = cell.get('t', '')
            v_el = cell.find('ns:v', ns)
            if v_el is None:
                row_data.append('')
            elif t == 's':
                idx = int(v_el.text)
                row_data.append(shared_strings[idx] if idx < len(shared_strings) else '')
            elif t == 'inlineStr':
                is_el = cell.find('.//ns:t', ns)
                row_data.append(is_el.text if is_el is not None else '')
            else:
                row_data.append(v_el.text or '')
        result.append(row_data)
    return result

# Phase 3A relevant sheets (1-indexed)
relevant = [1, 2, 3, 4, 5, 6, 7, 8, 9, 14, 15, 16, 44, 45]

sheet_names = {
    1: 'Index', 2: 'Students_All', 3: 'Students_Year4', 4: 'Students_Year5',
    5: 'Students_Year6', 6: 'Batches_Groups', 7: 'Students_At_Risk',
    8: 'Student_Group_Assignments', 9: 'Staff_Supervisors',
    14: 'Departments', 15: 'Training_Sites', 16: 'Partnerships',
    44: 'Academic_Calendar', 45: 'Academic_Years'
}

with zipfile.ZipFile(xlsx_path, 'r') as z:
    shared_strings = get_shared_strings(z)
    
    for sheet_num in relevant:
        name = sheet_names.get(sheet_num, 'unknown')
        print(f'\n=== SHEET {sheet_num}: {name} ===')
        rows = get_sheet_data(z, sheet_num, shared_strings, max_rows=12)
        for i, row in enumerate(rows):
            print(f'  Row {i+1}: {row}')
