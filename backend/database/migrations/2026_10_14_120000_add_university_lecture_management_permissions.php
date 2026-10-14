<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        $now = now();
        foreach ([
            ['code' => 'university_lectures.manage', 'module' => 'University Lectures', 'action' => 'MANAGE', 'description_key' => 'permissions.university_lectures_manage.description'],
            ['code' => 'university_lectures.delete_with_attendance', 'module' => 'University Lectures', 'action' => 'DELETE_WITH_ATTENDANCE', 'description_key' => 'permissions.university_lectures_delete_with_attendance.description'],
        ] as $permission) {
            DB::table('permissions')->insertOrIgnore($permission + ['created_at' => $now, 'updated_at' => $now]);
        }

        // Preserve the three roles that already managed university lectures.
        // The administrative assistant's access remains OFF until an admin
        // grants it in the permission matrix; permanent deletion is OFF for all.
        $permissionId = DB::table('permissions')->where('code', 'university_lectures.manage')->value('id');
        $reviewId = DB::table('permissions')->where('code', 'attendance.review')->value('id');
        $roles = DB::table('roles')->whereIn('code', ['SYS_ADMIN', 'RTA', 'CLINICAL_DIRECTOR'])
            ->whereIn('id', DB::table('role_permissions')->where('permission_id', $reviewId)->pluck('role_id'))
            ->pluck('id');
        foreach ($roles as $roleId) {
            DB::table('role_permissions')->insertOrIgnore([
                'role_id' => $roleId, 'permission_id' => $permissionId,
                'scope_type' => 'global', 'created_at' => $now, 'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        // Role grants may have been changed in the permission matrix; do not
        // silently erase an administrator's choices during a rollback.
    }
};
