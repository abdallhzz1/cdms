<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $now = now();
        $permissionId = DB::table('permissions')->where('code', 'clinical_schedule.view')->value('id');
        if (! $permissionId) {
            $permissionId = DB::table('permissions')->insertGetId([
                'code' => 'clinical_schedule.view',
                'module' => 'Distribution',
                'action' => 'VIEW_CLINICAL_SCHEDULE',
                'description_key' => 'permissions.clinical_schedule_view.description',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        $legacyPermissionId = DB::table('permissions')->where('code', 'distribution.view')->value('id');
        if ($legacyPermissionId) {
            foreach (DB::table('role_permissions')->where('permission_id', $legacyPermissionId)->get() as $grant) {
                DB::table('role_permissions')->updateOrInsert(
                    ['role_id' => $grant->role_id, 'permission_id' => $permissionId],
                    [
                        'scope_type' => $grant->scope_type ?: 'global',
                        'created_at' => $now,
                        'updated_at' => $now,
                    ],
                );
            }
        }
    }

    public function down(): void
    {
        // Keep permission choices made later through the permission matrix.
    }
};
