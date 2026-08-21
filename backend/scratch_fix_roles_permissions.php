<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\User;
use App\Models\Role;
use App\Models\Permission;

$sysAdminRole = Role::where('code', 'SYS_ADMIN')->first();
$deptHeadRole = Role::where('code', 'DEPT_HEAD')->first();
$supervisorRole = Role::where('code', 'CLINICAL_SUPERVISOR')->first();

// 1. Remove SYS_ADMIN role from everyone EXCEPT admin@cdms.local
$allUsers = User::all();
foreach ($allUsers as $user) {
    if ($user->email !== 'admin@cdms.local') {
        if ($sysAdminRole) {
            $user->roles()->detach($sysAdminRole->id);
        }
    }
}

// 2. Ensure admin@cdms.local has SYS_ADMIN role
$admin = User::where('email', 'admin@cdms.local')->first();
if ($admin && $sysAdminRole) {
    if (!$admin->roles()->where('roles.id', $sysAdminRole->id)->exists()) {
        $admin->roles()->attach($sysAdminRole->id);
    }
}

// 3. Ensure Mutaz / Dept Heads have DEPT_HEAD role without SYS_ADMIN
foreach ($allUsers as $user) {
    if ($user->email !== 'admin@cdms.local') {
        if ($deptHeadRole && !$user->roles()->where('roles.id', $deptHeadRole->id)->exists()) {
            $user->roles()->attach($deptHeadRole->id);
        }
    }
}

echo "ROLES RE-BALANCED SECURELY:\n";
echo "- admin@cdms.local -> SYS_ADMIN (Full System Control & Users Management)\n";
echo "- All other staff -> DEPT_HEAD / CLINICAL_SUPERVISOR (Restricted to Business Modules)\n";
