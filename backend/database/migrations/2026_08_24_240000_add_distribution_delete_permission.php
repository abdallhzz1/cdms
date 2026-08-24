<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $permissionId = DB::table('permissions')->where('code', 'distribution.delete')->value('id');
        if (! $permissionId) {
            $permissionId = DB::table('permissions')->insertGetId([
                'code' => 'distribution.delete',
                'module' => 'Distribution',
                'action' => 'DELETE',
                'description_key' => 'permissions.distribution_delete.description',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $roleId = DB::table('roles')->where('code', 'CLINICAL_DIRECTOR')->value('id');
        if ($roleId) {
            DB::table('role_permissions')->updateOrInsert(
                ['role_id' => $roleId, 'permission_id' => $permissionId],
                ['scope_type' => 'global', 'created_at' => now(), 'updated_at' => now()],
            );
        }
    }

    public function down(): void
    {
        // Keep the permission and grant to avoid silently revoking operational access.
    }
};
