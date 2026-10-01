<?php

namespace Database\Seeders;

use App\Models\{Permission, Role};
use Illuminate\Database\Seeder;

/** Additive only: never reset existing role grants or assign a clinical role. */
class BasicAttendancePermissionSeeder extends Seeder
{
    public function run(): void
    {
        $ids = [];
        foreach (['view', 'record', 'manage', 'export', 'delete'] as $action) {
            $ids[$action] = Permission::firstOrCreate(['code' => 'basic_attendance.'.$action], ['module' => 'BasicAttendance', 'action' => strtoupper($action), 'description_key' => 'basicAttendance.permissions.'.$action])->id;
        }
        foreach (['BASIC_LECTURER' => ['view', 'record', 'export'], 'BASIC_ATTENDANCE_ADMIN' => array_keys($ids)] as $code => $actions) {
            $role = Role::firstOrCreate(['code' => $code], ['name_key' => 'roles.'.strtolower($code).'.name', 'description_key' => 'roles.'.strtolower($code).'.description']);
            $role->permissions()->syncWithoutDetaching(collect($actions)->mapWithKeys(fn ($action) => [$ids[$action] => ['scope_type' => 'global']])->all());
        }
        if ($admin = Role::where('code', 'SYS_ADMIN')->first()) {
            $admin->permissions()->syncWithoutDetaching(collect($ids)->mapWithKeys(fn ($id) => [$id => ['scope_type' => 'global']])->all());
        }
    }
}
