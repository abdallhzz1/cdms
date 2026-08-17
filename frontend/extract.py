import os, re, json

def find_keys():
    keys = set()
    p1 = re.compile(r"t\('([^']+)'")
    p2 = re.compile(r't\("([^"]+)"')
    for root, _, files in os.walk('src'):
        for file in files:
            if file.endswith('.tsx') or file.endswith('.ts'):
                try:
                    with open(os.path.join(root, file), 'r', encoding='utf-8') as f:
                        c = f.read()
                        keys.update(p1.findall(c))
                        keys.update(p2.findall(c))
                except:
                    pass
    return keys

all_keys = list(find_keys())
all_keys.sort()
print(json.dumps(all_keys, indent=2))
