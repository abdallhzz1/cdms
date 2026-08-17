import re

def fix(f):
    with open(f, 'r', encoding='utf-8') as file:
        c = file.read()
    
    # Fix button closing tags
    c = c.replace('</Button>\n          )}\n        </div>', '</button>\n          )}\n        </div>')
    
    # Fix search button tag
    c = c.replace('<button\n            type="submit"\n            className="rounded-md bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm border border-slate-300 hover:bg-slate-50 focus:outline-none"\n          >\n            {t(\'common.search\', \'بحث\')}\n          </Button>',
                  '<Button type="submit" variant="outline">{t(\'common.search\', \'بحث\')}</Button>')

    # Fix table headers being unclosed properly
    c = c.replace('</TableHeader>\n              <TableBody>', '</tr>\n              </TableHeader>\n              <TableBody>')
    # actually let's just make sure `<TableHead>` are well formed.
    c = c.replace('<TableHead><span className="sr-only">', '<TableHead><span className="sr-only">')

    # Fix the missing `</div>` before `{data && data.meta` etc.
    c = c.replace('</Table>\n            {data && data.meta', '</Table>\n          </div>\n            {data && data.meta')
    c = c.replace('</Table>\n            {scheduleData && scheduleData.meta', '</Table>\n          </div>\n            {scheduleData && scheduleData.meta')

    # Fix Department/TrainingSite unclosed tables
    c = c.replace('</TableBody>\n            \n          </div>', '</TableBody>\n            </Table>\n          </div>')
    
    with open(f, 'w', encoding='utf-8') as file:
        file.write(c)

for f in ['src/pages/DistributionList.tsx', 'src/pages/ClinicalSchedule.tsx', 'src/pages/DepartmentRoster.tsx', 'src/pages/TrainingSiteRoster.tsx']:
    fix(f)
