import glob
import re

for filepath in glob.glob('tests/Feature/**/*.php', recursive=True):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    changed = False

    # This covers ->permissions()->sync(\App\Models\Permission::pluck('id'));
    old_sync_1 = "->permissions()->sync(\\App\\Models\\Permission::pluck('id'));"
    new_sync_1 = "->permissions()->sync(\\App\\Models\\Permission::pluck('id')->mapWithKeys(fn($id) => [$id => ['scope_type' => 'global']])->all());"
    if old_sync_1 in content:
        content = content.replace(old_sync_1, new_sync_1)
        changed = True

    # This covers ->permissions()->sync(Permission::pluck('id'));
    old_sync_2 = "->permissions()->sync(Permission::pluck('id'));"
    new_sync_2 = "->permissions()->sync(Permission::pluck('id')->mapWithKeys(fn($id) => [$id => ['scope_type' => 'global']])->all());"
    if old_sync_2 in content:
        content = content.replace(old_sync_2, new_sync_2)
        changed = True

    if changed:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print('Fixed:', filepath)
