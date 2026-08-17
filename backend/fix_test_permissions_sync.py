import glob

files = [
    'tests/Feature/Phase6C/Phase6CTest.php',
    'tests/Feature/Phase6E/Phase6ETest.php'
]

for filepath in files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    content = content.replace(
        "$this->adminRole->permissions()->sync($permissionIds);",
        "$syncData = []; foreach($permissionIds as $id) { $syncData[$id] = ['scope_type' => 'global']; } $this->adminRole->permissions()->sync($syncData);"
    )

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

print("Fixed sync test permissions")
