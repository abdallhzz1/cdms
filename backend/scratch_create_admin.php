<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\User;
use App\Models\Role;

$email = 'admin@cdms.local';
$password = 'password123';

$user = User::where('email', $email)->first();
if (!$user) {
    $user = User::create([
        'name' => 'CDMS System Admin',
        'email' => $email,
        'password' => $password,
        'is_active' => true,
    ]);
    echo "CREATED ADMIN USER: {$email}\n";
} else {
    $user->password = $password;
    $user->is_active = true;
    $user->save();
    echo "UPDATED ADMIN USER PASSWORD: {$email}\n";
}

$sysAdmin = Role::where('code', 'SYS_ADMIN')->first();
if ($sysAdmin) {
    if (!$user->roles()->where('roles.id', $sysAdmin->id)->exists()) {
        $user->roles()->attach($sysAdmin->id);
        echo "ATTACHED SYS_ADMIN ROLE TO: {$email}\n";
    }
}

echo "ADMIN READY TO LOGIN WITH: {$email} / {$password}\n";
