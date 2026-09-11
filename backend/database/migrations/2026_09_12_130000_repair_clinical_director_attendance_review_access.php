<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $now = now();
        DB::table('permissions')->insertOrIgnore([
            'code' => 'attendance.review',
            'module' => 'Attendance',
            'action' => 'REVIEW',
            'description_key' => 'permissions.attendance_review.description',
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        $roleId = DB::table('roles')->where('code', 'CLINICAL_DIRECTOR')->value('id');
        $permissionId = DB::table('permissions')->where('code', 'attendance.review')->value('id');
        if ($roleId && $permissionId) {
            DB::table('role_permissions')->updateOrInsert(
                ['role_id' => $roleId, 'permission_id' => $permissionId],
                ['scope_type' => 'global', 'created_at' => $now, 'updated_at' => $now],
            );
        }
    }

    public function down(): void
    {
        // Keep explicit authorization decisions intact when rolling back.
    }
};
