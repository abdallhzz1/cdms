import glob

def add_status(filepath, is_ar):
    with open(filepath, 'r', encoding='utf-8') as f:
        c = f.read()
    
    if 'needs_attention:' not in c:
        if is_ar:
            rep = "draft: 'مسودة',\n        completed: 'مكتمل',\n        needs_attention: 'يحتاج إلى انتباه',\n        full: 'ممتلئ',\n        over_capacity: 'فوق السعة'"
            c = c.replace("draft: 'مسودة'", rep)
        else:
            rep = "draft: 'Draft',\n        completed: 'Completed',\n        needs_attention: 'Needs Attention',\n        full: 'Full',\n        over_capacity: 'Over Capacity'"
            c = c.replace("draft: 'Draft'", rep)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(c)

add_status('src/i18n/locales/ar.ts', True)
add_status('src/i18n/locales/en.ts', False)
