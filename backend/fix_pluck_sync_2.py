import glob
import re

for filepath in glob.glob('tests/Feature/**/*.php', recursive=True):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    changed = False

    # Replace attach(\App\Models\Permission::whereIn(...)->pluck('id')) or attach(Permission::...)
    old_attach_pluck = re.compile(r"attach\(\s*(?:\\\\App\\\\Models\\\\)?Permission::where(?:In)?\([^)]+\)->pluck\('id'\)\s*\)")
    def repl_attach_pluck(m):
        inner = m.group(0)[7:-1].strip() # get the Permission::...->pluck('id') part
        return f"attach({inner}->mapWithKeys(fn(\$id) => [\$id => ['scope_type' => 'global']])->all())"
    
    if old_attach_pluck.search(content):
        # wait, attach does not take array with mapWithKeys directly if it's the second arg?
        # actually attach( [ id => ['scope_type' => 'global'] ] ) works perfectly!
        # wait, attach($id, ['scope_type' => 'global']) is for a single ID.
        # for an array, attach($array_with_pivot) is correct!
        content = old_attach_pluck.sub(r"sync(\1->mapWithKeys(fn($id) => [$id => ['scope_type' => 'global']])->all())", content)
        # Actually my python sub needs a function or string. Let me do it cleanly:
        pass

    # A simpler approach: Just match `->pluck('id'))` inside `attach(` and replace `attach(` with `sync(` and append mapWithKeys
    pattern = r"attach\(\s*((?:\\\\App\\\\Models\\\\)?Permission::where(?:In)?\([^)]+\)->pluck\('id'\))\s*\)"
    def repl_pattern(m):
        return f"sync({m.group(1)}->mapWithKeys(fn($id) => [$id => ['scope_type' => 'global']])->all())"
    
    if re.search(pattern, content):
        content = re.sub(pattern, repl_pattern, content)
        changed = True

    if changed:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Fixed {filepath}")

print("Done fixing test permissions 2")
