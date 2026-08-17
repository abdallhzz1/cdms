import glob

files = [
    'tests/Feature/Phase6B/Phase6BTest.php',
    'tests/Feature/Phase6C/Phase6CTest.php',
    'tests/Feature/Phase6E/Phase6ETest.php'
]

for filepath in files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    content = content.replace(
        "$viewerRole->permissions()->attach(Permission::where('code', 'distribution.view')->pluck('id'));",
        "$viewerRole->permissions()->attach(\\App\\Models\\Permission::where('code', 'distribution.view')->first()->id, ['scope_type' => 'global']);"
    )

    content = content.replace(
        "$this->adminRole->permissions()->attach($perm->id);",
        "$this->adminRole->permissions()->attach($perm->id, ['scope_type' => 'global']);"
    )

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

print("Fixed test permissions")
