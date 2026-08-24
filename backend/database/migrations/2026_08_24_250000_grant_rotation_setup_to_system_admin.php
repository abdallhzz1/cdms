<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $roleId = DB::table('roles')->where('code', 'SYS_ADMIN')->value('id');
        if (! $roleId) {
            return;
        }

        $permissionIds = DB::table('permissions')
            ->whereIn('code', ['rotations.view', 'rotations.create', 'rotations.update'])
            ->pluck('id');

        foreach ($permissionIds as $permissionId) {
            DB::table('role_permissions')->updateOrInsert(
                ['role_id' => $roleId, 'permission_id' => $permissionId],
                ['scope_type' => 'global', 'created_at' => now(), 'updated_at' => now()],
            );
        }
    }

    public function down(): void
    {
        // Keep operational access to avoid unexpectedly locking out setup users.
    }
};
