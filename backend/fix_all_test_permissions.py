import glob
import re

for filepath in glob.glob('tests/Feature/**/*.php', recursive=True):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    changed = False

    # Replace attach(Permission::whereIn(...)->pluck('id'))
    old_attach_pluck = re.compile(r"attach\(\s*Permission::where(?:In)?\([^)]+\)->pluck\('id'\)\s*\)")
    def repl_attach_pluck(m):
        inner = m.group(0)[7:-1].strip() # get the Permission::...->pluck('id') part
        return f"attach({inner}, ['scope_type' => 'global'])"
    
    if old_attach_pluck.search(content):
        content = old_attach_pluck.sub(repl_attach_pluck, content)
        changed = True

    # Replace attach($perm->id) or attach($permission->id)
    old_attach_id = re.compile(r"attach\(\s*(\$[a-zA-Z0-9_]+->id)\s*\)")
    def repl_attach_id(m):
        return f"attach({m.group(1)}, ['scope_type' => 'global'])"
    
    if old_attach_id.search(content):
        content = old_attach_id.sub(repl_attach_id, content)
        changed = True

    # Replace sync($permissionIds)
    old_sync = re.compile(r"sync\(\s*(\$permissionIds)\s*\)")
    def repl_sync(m):
        var_name = m.group(1)
        return f"sync(collect({var_name})->mapWithKeys(fn(\$id) => [\$id => ['scope_type' => 'global']])->all())"
    
    if old_sync.search(content):
        content = old_sync.sub(repl_sync, content)
        changed = True

    if changed:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Fixed {filepath}")

print("Done fixing test permissions")
