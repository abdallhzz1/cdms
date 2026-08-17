
import os
import re
import json

keys = set()
for root, _, files in os.walk("src"):
    for f in files:
        if f.endswith(".tsx") or f.endswith(".ts"):
            path = os.path.join(root, f)
            with open(path, "r", encoding="utf-8") as file:
                content = file.read()
                matches = re.findall(r"t\([\x27\x22]([a-zA-Z0-9_\.]+)[\x27\x22]", content)
                for m in matches:
                    keys.add(m)

missing_keys = sorted(list(keys))
print(json.dumps(missing_keys))

