import re

def fix_file(f):
    with open(f, 'r', encoding='utf-8') as file:
        c = file.read()
    
    # In DistributionList, there's a rogue </Button> where it should be </button> for the create button
    if "t('distribution.actions.create'" in c:
        c = re.sub(r'<Button([^>]*)>\s*\{t\(\'distribution.actions.create\'.*?\)\}\s*</Button>',
                   r'<Button\1>{t(\'distribution.actions.create\', \'إنشاء توزيع جديد\')}</Button>', c)
    
    if "</Button>\n          )}\n        </div>" in c:
        c = c.replace("</Button>\n          )}\n        </div>", "</button>\n          )}\n        </div>")

    # In ClinicalSchedule, the submit button
    if "t('common.search'" in c and "</Button>" in c:
        c = re.sub(r'<Button type="submit" variant="outline">\s*\{t\(\'common.search\'.*?\)\}\s*</Button>',
                   r'<Button type="submit" variant="outline">{t(\'common.search\', \'بحث\')}</Button>', c)

    # In DistributionList / ClinicalSchedule we lost the </div> wrapper
    c = c.replace('            {data && data.meta', '          </div>\n            {data && data.meta')
    c = c.replace('            {scheduleData && scheduleData.meta', '          </div>\n            {scheduleData && scheduleData.meta')
    c = c.replace('            {rosterData && rosterData.meta', '          </div>\n            {rosterData && rosterData.meta')

    # Fix unclosed tables
    c = c.replace('<tbody>', '<TableBody>')
    c = c.replace('</tbody>', '</TableBody>')
    
    # Fix the missing Table components
    c = c.replace('</table>', '')
    
    with open(f, 'w', encoding='utf-8') as file:
        file.write(c)

for file in ['src/pages/DistributionList.tsx', 'src/pages/ClinicalSchedule.tsx', 'src/pages/DepartmentRoster.tsx', 'src/pages/TrainingSiteRoster.tsx']:
    fix_file(file)

f2 = 'src/pages/ReportsDashboard.test.tsx'
with open(f2, 'r', encoding='utf-8') as file:
    c = file.read()
c = c.replace('../test/utils', '@/test/renderWithProviders')
with open(f2, 'w', encoding='utf-8') as file:
    file.write(c)

print('Syntax fixed')
