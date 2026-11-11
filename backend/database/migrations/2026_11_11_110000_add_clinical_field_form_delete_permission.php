<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('permissions')->updateOrInsert(
            ['code' => 'clinical_field_monitoring.delete'],
            [
                'module' => 'Clinical Field Monitoring',
                'action' => 'DELETE',
                'description_key' => 'permissions.clinical_field_monitoring_delete.description',
                'created_at' => now(),
                'updated_at' => now(),
            ],
        );

        $roleIds = DB::table('roles')->whereIn('code', ['SYS_ADMIN', 'ADMIN_ASSISTANT'])->pluck('id');

        foreach ($roleIds as $roleId) {
            foreach (DB::table('permissions')->whereIn('code', [
                'clinical_field_monitoring.view',
                'clinical_field_monitoring.export',
                'clinical_field_monitoring.delete',
            ])->pluck('id') as $grantPermissionId) {
                DB::table('role_permissions')->updateOrInsert(
                    ['role_id' => $roleId, 'permission_id' => $grantPermissionId],
                    ['scope_type' => 'global', 'created_at' => now(), 'updated_at' => now()],
                );
            }
        }
    }

    public function down(): void
    {
        $permissionId = DB::table('permissions')->where('code', 'clinical_field_monitoring.delete')->value('id');
        if (! $permissionId) {
            return;
        }

        DB::table('role_permissions')->where('permission_id', $permissionId)->delete();
        DB::table('permissions')->where('id', $permissionId)->delete();
    }
};
