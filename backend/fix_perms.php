<?php
require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$role = \App\Models\Role::where('code', 'SYS_ADMIN')->first();
$permissions = \App\Models\Permission::pluck('id');
foreach($permissions as $pId) {
    if (!$role->permissions()->where('permission_id', $pId)->exists()) {
        $role->permissions()->attach($pId, ['scope_type' => 'global']);
    }
}
echo "All permissions assigned to SYS_ADMIN.\n";
