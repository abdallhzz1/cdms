<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $roleId = DB::table('roles')->where('code', 'RTA')->value('id');
        $permissionId = DB::table('permissions')->where('code', 'attendance.review')->value('id');

        if ($roleId && $permissionId) {
            DB::table('role_permissions')->insertOrIgnore([
                'role_id' => $roleId,
                'permission_id' => $permissionId,
                'scope_type' => 'global',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        // Do not remove an administrator-managed permission on rollback.
    }
};
