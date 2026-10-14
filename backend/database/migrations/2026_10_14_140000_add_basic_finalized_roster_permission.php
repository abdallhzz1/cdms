<?php

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration {
    public function up(): void
    {
        $permission = Permission::firstOrCreate(
            ['code' => 'basic_attendance.amend_finalized'],
            ['module' => 'BasicAttendance', 'action' => 'AMEND_FINALIZED', 'description_key' => 'basicAttendance.permissions.amendFinalized'],
        );

        // This exceptional access must be granted deliberately in the matrix.
        if ($systemAdmin = Role::where('code', 'SYS_ADMIN')->first()) {
            $systemAdmin->permissions()->syncWithoutDetaching([
                $permission->id => ['scope_type' => 'global'],
            ]);
        }
    }

    public function down(): void
    {
        if ($permission = Permission::where('code', 'basic_attendance.amend_finalized')->first()) {
            $permission->roles()->detach();
            $permission->directlyGrantedUsers()->detach();
            $permission->delete();
        }
    }
};
