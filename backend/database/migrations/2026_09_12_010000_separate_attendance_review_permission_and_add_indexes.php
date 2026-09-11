<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('permissions')->insertOrIgnore([
            'code' => 'attendance.review',
            'module' => 'Attendance',
            'action' => 'REVIEW',
            'description_key' => 'permissions.attendance_review.description',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $reviewPermissionId = DB::table('permissions')->where('code', 'attendance.review')->value('id');
        $viewPermissionId = DB::table('permissions')->where('code', 'attendance.view')->value('id');
        if ($reviewPermissionId && $viewPermissionId) {
            $roleIds = DB::table('role_permissions')
                ->join('roles', 'roles.id', '=', 'role_permissions.role_id')
                ->where('role_permissions.permission_id', $viewPermissionId)
                ->where('roles.code', '!=', 'CLINICAL_SUPERVISOR')
                ->pluck('role_permissions.role_id');
            foreach ($roleIds as $roleId) {
                DB::table('role_permissions')->updateOrInsert(
                    ['role_id' => $roleId, 'permission_id' => $reviewPermissionId],
                    ['scope_type' => 'global', 'created_at' => now(), 'updated_at' => now()],
                );
            }
        }

        Schema::table('clinical_sessions', function (Blueprint $table) {
            $table->index('session_date', 'clinical_sessions_date_idx');
            $table->index(['rotation_block_id', 'training_site_id', 'session_date'], 'clinical_sessions_scope_date_idx');
        });
        Schema::table('attendance_records', function (Blueprint $table) {
            $table->index(['student_id', 'status'], 'attendance_student_status_idx');
        });
    }

    public function down(): void
    {
        Schema::table('attendance_records', fn (Blueprint $table) => $table->dropIndex('attendance_student_status_idx'));
        Schema::table('clinical_sessions', function (Blueprint $table) {
            $table->dropIndex('clinical_sessions_date_idx');
            $table->dropIndex('clinical_sessions_scope_date_idx');
        });

        $permissionId = DB::table('permissions')->where('code', 'attendance.review')->value('id');
        if ($permissionId) {
            DB::table('role_permissions')->where('permission_id', $permissionId)->delete();
            DB::table('permissions')->where('id', $permissionId)->delete();
        }
    }
};
