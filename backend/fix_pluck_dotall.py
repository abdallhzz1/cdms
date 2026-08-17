import glob
import re

for filepath in glob.glob('tests/Feature/**/*.php', recursive=True):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    changed = False

    # replace ->attach( <anything> ->pluck('id')); 
    # replace ->sync( <anything> ->pluck('id'));
    
    # We can match ->attach( ... ->pluck('id') ) even across lines
    pattern_attach = re.compile(r"->attach\(\s*(.*?->pluck\('id'\))\s*\)", re.DOTALL)
    def repl_attach(m):
        return f"->sync({m.group(1)}->mapWithKeys(fn($id) => [$id => ['scope_type' => 'global']])->all())"
    
    if pattern_attach.search(content):
        content = pattern_attach.sub(repl_attach, content)
        changed = True

    pattern_sync = re.compile(r"->sync\(\s*(.*?->pluck\('id'\))\s*\)", re.DOTALL)
    def repl_sync(m):
        return f"->sync({m.group(1)}->mapWithKeys(fn($id) => [$id => ['scope_type' => 'global']])->all())"
    
    if pattern_sync.search(content):
        content = pattern_sync.sub(repl_sync, content)
        changed = True

    if changed:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Fixed {filepath}")

print("Done fixing test permissions dotall")
