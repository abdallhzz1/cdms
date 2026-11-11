<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $roleId = DB::table('roles')->where('code', 'VICE_DEAN')->value('id');
        if (! $roleId) {
            return;
        }

        $permissionIds = DB::table('permissions')->whereIn('code', [
            'clinical_field_monitoring.view',
            'clinical_field_monitoring.review',
            'clinical_field_monitoring.export',
        ])->pluck('id');

        foreach ($permissionIds as $permissionId) {
            DB::table('role_permissions')->updateOrInsert(
                ['role_id' => $roleId, 'permission_id' => $permissionId],
                ['scope_type' => 'global', 'created_at' => now(), 'updated_at' => now()],
            );
        }
    }

    public function down(): void
    {
        $roleId = DB::table('roles')->where('code', 'VICE_DEAN')->value('id');
        if (! $roleId) {
            return;
        }

        $permissionIds = DB::table('permissions')->whereIn('code', [
            'clinical_field_monitoring.view',
            'clinical_field_monitoring.review',
            'clinical_field_monitoring.export',
        ])->pluck('id');

        DB::table('role_permissions')->where('role_id', $roleId)->whereIn('permission_id', $permissionIds)->delete();
    }
};
