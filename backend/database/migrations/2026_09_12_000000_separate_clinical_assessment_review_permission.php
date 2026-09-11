<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('permissions')->insertOrIgnore([
            'code' => 'assessment.review',
            'module' => 'Assessment',
            'action' => 'REVIEW',
            'description_key' => 'permissions.assessment_review.description',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $reviewPermissionId = DB::table('permissions')->where('code', 'assessment.review')->value('id');
        $viewPermissionId = DB::table('permissions')->where('code', 'assessment.view')->value('id');

        if (! $reviewPermissionId || ! $viewPermissionId) {
            return;
        }

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

    public function down(): void
    {
        $permissionId = DB::table('permissions')->where('code', 'assessment.review')->value('id');
        if ($permissionId) {
            DB::table('role_permissions')->where('permission_id', $permissionId)->delete();
            DB::table('permissions')->where('id', $permissionId)->delete();
        }
    }
};
