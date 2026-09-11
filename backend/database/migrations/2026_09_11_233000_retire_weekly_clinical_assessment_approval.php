<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('approval_workflows') || ! Schema::hasTable('approval_requests')) {
            return;
        }

        $workflowId = DB::table('approval_workflows')->where('code', 'clinical_assessment')->value('id');
        if (! $workflowId) {
            return;
        }

        DB::transaction(function () use ($workflowId) {
            DB::table('approval_requests')
                ->where('approval_workflow_id', $workflowId)
                ->where('status', 'pending')
                ->update(['status' => 'cancelled', 'updated_at' => now()]);

            DB::table('approval_workflows')->where('id', $workflowId)->update([
                'is_active' => false,
                'updated_at' => now(),
            ]);
        });

        if (Schema::hasTable('permissions') && Schema::hasTable('role_permissions')) {
            $permissionId = DB::table('permissions')->where('code', 'assessment.approve')->value('id');
            if ($permissionId) {
                DB::table('role_permissions')->where('permission_id', $permissionId)->delete();
                DB::table('permissions')->where('id', $permissionId)->delete();
            }
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('approval_workflows')) {
            DB::table('approval_workflows')->where('code', 'clinical_assessment')->update([
                'is_active' => true,
                'updated_at' => now(),
            ]);
        }
    }
};
