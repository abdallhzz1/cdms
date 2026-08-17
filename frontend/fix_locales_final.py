
import json
import os
import re
import ast

def get_keys(content):
    matches = re.findall(r"t\([\x27\x22]([a-zA-Z0-9_\.]+)[\x27\x22]", content)
    return set(matches)

keys = set()
for root, _, files in os.walk("src"):
    for f in files:
        if f.endswith(".tsx") or f.endswith(".ts"):
            with open(os.path.join(root, f), "r", encoding="utf-8") as file:
                keys.update(get_keys(file.read()))

# Build nested dictionary
def set_nested(d, path, val):
    parts = path.split(".")
    for part in parts[:-1]:
        if part not in d:
            d[part] = {}
        d = d[part]
    d[parts[-1]] = val

merged = {}
for k in keys:
    # Use the key as its own value for English/Arabic (as fallback)
    set_nested(merged, k, k)

def dict_to_ts(d, indent=2):
    lines = []
    for k, v in d.items():
        if isinstance(v, dict):
            lines.append(" "*indent + f"{k}: {{")
            lines.append(dict_to_ts(v, indent+2))
            lines.append(" "*indent + "},")
        else:
            lines.append(" "*indent + f"{k}: \x27{v}\x27,")
    return "\n".join(lines)

ts_str = dict_to_ts(merged)
out_en = "const en = {\n" + ts_str + "\n};\nexport default en;"
out_ar = "import type en from \x27./en\x27;\nconst ar: typeof en = {\n" + ts_str + "\n};\nexport default ar;"

with open("src/i18n/locales/en.ts", "w", encoding="utf-8") as f:
    f.write(out_en)
with open("src/i18n/locales/ar.ts", "w", encoding="utf-8") as f:
    f.write(out_ar)

print("Done generating i18n files!")

