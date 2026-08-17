import glob

filepath = 'tests/Feature/Phase6E/Phase6ETest.php'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the specific attach logic for P6E_FP role
old_code = """$adminRole->permissions()->attach(Permission::whereIn('code', [
            'distribution.view', 'distribution.create', 'distribution.update',
            'distribution.approve', 'distribution.publish', 'distribution.override',
        ])->pluck('id'));"""

new_code = """$permIds = Permission::whereIn('code', [
            'distribution.view', 'distribution.create', 'distribution.update',
            'distribution.approve', 'distribution.publish', 'distribution.override',
        ])->pluck('id');
        $syncData = [];
        foreach($permIds as $id) { $syncData[$id] = ['scope_type' => 'global']; }
        $adminRole->permissions()->sync($syncData);"""

content = content.replace(old_code, new_code)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed Phase6ETest fingerprint test permissions")
