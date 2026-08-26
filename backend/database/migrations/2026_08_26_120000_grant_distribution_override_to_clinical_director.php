<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $roleId = DB::table('roles')->where('code', 'CLINICAL_DIRECTOR')->value('id');
        $permissionIds = DB::table('permissions')
            ->whereIn('code', [
                'distribution.schedule_rows.manage',
                'distribution.student_portal.manage',
                'distribution.revise',
                'distribution.unpublish',
                'distribution.override',
            ])
            ->pluck('id');

        if (! $roleId) {
            return;
        }

        foreach ($permissionIds as $permissionId) {
            DB::table('role_permissions')->updateOrInsert(
                ['role_id' => $roleId, 'permission_id' => $permissionId],
                ['scope_type' => 'global', 'created_at' => now(), 'updated_at' => now()],
            );
        }
    }

    public function down(): void
    {
        // These grants may also have been assigned explicitly by an
        // administrator, so rollback must not revoke them implicitly.
    }
};
