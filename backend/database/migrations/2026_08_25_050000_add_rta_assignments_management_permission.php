<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $now = now();
        $permissionId = DB::table('permissions')->where('code', 'rta_assignments.manage')->value('id');
        if (! $permissionId) {
            $permissionId = DB::table('permissions')->insertGetId([
                'code' => 'rta_assignments.manage',
                'module' => 'Grades',
                'action' => 'MANAGE_RTA_ASSIGNMENTS',
                'description_key' => 'permissions.rta_assignments_manage.description',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
        $adminRoleId = DB::table('roles')->where('code', 'SYS_ADMIN')->value('id');
        if ($adminRoleId) {
            DB::table('role_permissions')->updateOrInsert(
                ['role_id' => $adminRoleId, 'permission_id' => $permissionId],
                ['scope_type' => 'global', 'created_at' => $now, 'updated_at' => $now],
            );
        }
    }

    public function down(): void
    {
        // Retain permission choices made later through the permission matrix.
    }
};
