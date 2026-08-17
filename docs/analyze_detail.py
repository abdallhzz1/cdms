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

def get_sheet_header(z, sheet_idx, shared_strings):
    xml_data = z.read(f'xl/worksheets/sheet{sheet_idx}.xml')
    root = ET.fromstring(xml_data)
    ns = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    rows = root.findall('.//ns:row', ns)
    if not rows:
        return []
    row = rows[0]
    row_data = []
    for cell in row.findall('ns:c', ns):
        t = cell.get('t', '')
        v_el = cell.find('ns:v', ns)
        if v_el is None:
            row_data.append('')
        elif t == 's':
            idx = int(v_el.text)
            row_data.append(shared_strings[idx] if idx < len(shared_strings) else '')
        else:
            row_data.append(v_el.text or '')
    return row_data

def get_sheet_rows(z, sheet_idx, shared_strings, start=0, count=5):
    xml_data = z.read(f'xl/worksheets/sheet{sheet_idx}.xml')
    root = ET.fromstring(xml_data)
    ns = {'ns': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    rows = root.findall('.//ns:row', ns)
    result = []
    for row in rows[start:start+count]:
        row_data = []
        for cell in row.findall('ns:c', ns):
            t = cell.get('t', '')
            v_el = cell.find('ns:v', ns)
            if v_el is None:
                row_data.append('')
            elif t == 's':
                idx = int(v_el.text)
                row_data.append(shared_strings[idx] if idx < len(shared_strings) else '')
            else:
                row_data.append(v_el.text or '')
        result.append(row_data)
    return result

with zipfile.ZipFile(xlsx_path, 'r') as z:
    shared_strings = get_shared_strings(z)
    
    # Sheet 2 = Students master list (columns)
    print('=== SHEET 2 (all students) - HEADER ===')
    for j, col in enumerate(get_sheet_header(z, 2, shared_strings)):
        print(f'  Col {j+1}: {col}')
    
    print('\n=== SHEET 2 - SAMPLE ROWS ===')
    for i, row in enumerate(get_sheet_rows(z, 2, shared_strings, 1, 4)):
        print(f'  Data Row {i+1}: {row}')
    
    # Sheet 3 = Year 4 students
    print('\n=== SHEET 3 (year 4 students) - HEADER ===')
    for j, col in enumerate(get_sheet_header(z, 3, shared_strings)):
        print(f'  Col {j+1}: {col}')
    
    # Sheet 14 = Departments
    print('\n=== SHEET 14 (departments) - HEADER ===')
    for j, col in enumerate(get_sheet_header(z, 14, shared_strings)):
        print(f'  Col {j+1}: {col}')
    
    print('\n=== SHEET 14 - ALL DEPARTMENT ROWS ===')
    for i, row in enumerate(get_sheet_rows(z, 14, shared_strings, 1, 20)):
        print(f'  DEP {i+1}: {row}')
