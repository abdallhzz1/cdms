<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('department_head_evaluations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('department_head_user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('department_id')->nullable()->constrained('departments')->nullOnDelete();
            $table->foreignId('academic_year_id')->nullable()->constrained('academic_years')->nullOnDelete();
            $table->string('evaluation_purpose')->default('annual_performance');
            $table->string('status')->default('draft');
            $table->json('domains');
            $table->json('major_achievements')->nullable();
            $table->json('development_areas')->nullable();
            $table->decimal('overall_score', 5, 1)->default(0);
            $table->string('overall_rating')->nullable();
            $table->string('recommendation')->nullable();
            $table->text('recommendation_notes')->nullable();
            $table->foreignId('evaluator_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('evaluator_name')->nullable();
            $table->string('evaluator_role')->nullable();
            $table->timestamp('evaluator_signed_at')->nullable();
            $table->foreignId('dean_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('dean_name')->nullable();
            $table->string('dean_role')->nullable();
            $table->timestamp('dean_signed_at')->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->json('activity_log')->nullable();
            $table->timestamps();
            $table->index(['department_head_user_id', 'academic_year_id']);
            $table->index(['status', 'academic_year_id']);
        });

        $permissions = [
            ['code' => 'department_head_evaluations.view', 'module' => 'Department Head Evaluations', 'action' => 'VIEW', 'description_key' => 'permissions.department_head_evaluations_view.description'],
            ['code' => 'department_head_evaluations.create', 'module' => 'Department Head Evaluations', 'action' => 'CREATE', 'description_key' => 'permissions.department_head_evaluations_create.description'],
            ['code' => 'department_head_evaluations.approve', 'module' => 'Department Head Evaluations', 'action' => 'APPROVE', 'description_key' => 'permissions.department_head_evaluations_approve.description'],
            ['code' => 'department_head_evaluations.export', 'module' => 'Department Head Evaluations', 'action' => 'EXPORT', 'description_key' => 'permissions.department_head_evaluations_export.description'],
        ];
        foreach ($permissions as $permission) {
            DB::table('permissions')->updateOrInsert(['code' => $permission['code']], $permission + ['updated_at' => now(), 'created_at' => now()]);
        }

        $grants = [
            'SYS_ADMIN' => array_column($permissions, 'code'),
            'SYSTEM_ADMIN' => array_column($permissions, 'code'),
            'CLINICAL_DIRECTOR' => array_column($permissions, 'code'),
            'DEAN' => array_column($permissions, 'code'),
        ];
        foreach ($grants as $roleCode => $codes) {
            $roleId = DB::table('roles')->where('code', $roleCode)->value('id');
            if (! $roleId) continue;
            foreach (DB::table('permissions')->whereIn('code', $codes)->pluck('id') as $permissionId) {
                DB::table('role_permissions')->updateOrInsert(
                    ['role_id' => $roleId, 'permission_id' => $permissionId],
                    ['scope_type' => 'global', 'updated_at' => now(), 'created_at' => now()]
                );
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('department_head_evaluations');
        DB::table('permissions')->whereIn('code', [
            'department_head_evaluations.view', 'department_head_evaluations.create',
            'department_head_evaluations.approve', 'department_head_evaluations.export',
        ])->delete();
    }
};
