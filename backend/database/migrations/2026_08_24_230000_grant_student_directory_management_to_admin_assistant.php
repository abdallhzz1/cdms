<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $roleId = DB::table('roles')->where('code', 'ADMIN_ASSISTANT')->value('id');
        if (! $roleId) return;

        $permissionIds = DB::table('permissions')
            ->whereIn('code', ['students.view', 'students.create', 'students.update'])
            ->pluck('id');

        foreach ($permissionIds as $permissionId) {
            DB::table('role_permissions')->updateOrInsert(
                ['role_id' => $roleId, 'permission_id' => $permissionId],
                ['scope_type' => 'global', 'scope_id' => null, 'created_at' => now(), 'updated_at' => now()],
            );
        }
    }

    public function down(): void
    {
        // Permissions are retained to avoid unexpectedly revoking operational access.
    }
};
