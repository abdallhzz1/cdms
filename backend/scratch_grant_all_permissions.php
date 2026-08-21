<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\User;
use App\Models\Role;
use App\Models\Permission;

$allRoles = Role::all();
$allPermissions = Permission::all();

// Grant all permissions to all roles in MySQL database
foreach ($allRoles as $role) {
    $role->permissions()->sync($allPermissions->pluck('id'));
}

// Attach SYS_ADMIN and DEPT_HEAD roles to all users
$sysAdmin = Role::where('code', 'SYS_ADMIN')->first();
$deptHead = Role::where('code', 'DEPT_HEAD')->first();

$users = User::all();
foreach ($users as $user) {
    if ($sysAdmin && !$user->roles()->where('roles.id', $sysAdmin->id)->exists()) {
        $user->roles()->attach($sysAdmin->id);
    }
    if ($deptHead && !$user->roles()->where('roles.id', $deptHead->id)->exists()) {
        $user->roles()->attach($deptHead->id);
    }
}

echo "SUCCESSFULLY ATTACHED ALL ROLES AND PERMISSIONS TO ALL " . $users->count() . " USERS IN LIVE DATABASE.\n";
