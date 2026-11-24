<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        foreach (['view' => 'VIEW_ATTENDANCE', 'manage' => 'MANAGE_ATTENDANCE'] as $action => $label) {
            $code = 'university_lectures.attendance.'.$action;
            DB::table('permissions')->updateOrInsert(['code' => $code], ['module' => 'University Lectures', 'action' => $label, 'description_key' => 'permissions.university_lectures_attendance_'.$action.'.description', 'created_at' => now(), 'updated_at' => now()]);
            $permissionId = DB::table('permissions')->where('code', $code)->value('id');
            foreach (DB::table('roles')->whereIn('code', ['SYS_ADMIN', 'CLINICAL_DIRECTOR', 'RTA', 'ADMIN_ASSISTANT'])->pluck('id') as $roleId) {
                DB::table('role_permissions')->insertOrIgnore(['role_id' => $roleId, 'permission_id' => $permissionId, 'scope_type' => 'global', 'created_at' => now(), 'updated_at' => now()]);
            }
        }
    }

    public function down(): void
    {
        $ids = DB::table('permissions')->whereIn('code', ['university_lectures.attendance.view', 'university_lectures.attendance.manage'])->pluck('id');
        DB::table('role_permissions')->whereIn('permission_id', $ids)->delete();
        DB::table('permissions')->whereIn('id', $ids)->delete();
    }
};
