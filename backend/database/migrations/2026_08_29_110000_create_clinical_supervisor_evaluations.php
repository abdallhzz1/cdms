<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('clinical_supervisor_evaluations')) {
            Schema::create('clinical_supervisor_evaluations', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('clinical_supervisor_user_id');
                $table->unsignedBigInteger('academic_year_id')->nullable();
                $table->string('evaluation_purpose')->default('annual_performance');
                $table->string('status')->default('draft');
                $table->json('domains');
                $table->json('strengths')->nullable();
                $table->json('development_areas')->nullable();
                $table->decimal('overall_score', 5, 1)->default(0);
                $table->string('overall_rating')->nullable();
                $table->string('recommendation')->nullable();
                $table->text('recommendation_notes')->nullable();
                $table->unsignedBigInteger('evaluator_user_id')->nullable();
                $table->string('evaluator_name')->nullable();
                $table->string('evaluator_role')->nullable();
                $table->timestamp('evaluator_signed_at')->nullable();
                $table->unsignedBigInteger('dean_user_id')->nullable();
                $table->string('dean_name')->nullable();
                $table->string('dean_role')->nullable();
                $table->timestamp('dean_signed_at')->nullable();
                $table->timestamp('submitted_at')->nullable();
                $table->timestamp('approved_at')->nullable();
                $table->json('activity_log')->nullable();
                $table->timestamps();
            });
        }
        $this->addForeignKeyIfMissing('clinical_supervisor_user_id', 'users', 'cse_supervisor_fk', 'cascade');
        $this->addForeignKeyIfMissing('academic_year_id', 'academic_years', 'cse_academic_year_fk', 'null');
        $this->addForeignKeyIfMissing('evaluator_user_id', 'users', 'cse_evaluator_fk', 'null');
        $this->addForeignKeyIfMissing('dean_user_id', 'users', 'cse_dean_fk', 'null');
        if (! Schema::hasIndex('clinical_supervisor_evaluations', 'cse_supervisor_year_idx')) {
            Schema::table('clinical_supervisor_evaluations', fn (Blueprint $table) => $table->index(['clinical_supervisor_user_id', 'academic_year_id'], 'cse_supervisor_year_idx'));
        }
        if (! Schema::hasIndex('clinical_supervisor_evaluations', 'cse_status_year_idx')) {
            Schema::table('clinical_supervisor_evaluations', fn (Blueprint $table) => $table->index(['status', 'academic_year_id'], 'cse_status_year_idx'));
        }

        $permissions = [
            ['code' => 'clinical_supervisor_evaluations.view', 'module' => 'Clinical Supervisor Evaluations', 'action' => 'VIEW', 'description_key' => 'permissions.clinical_supervisor_evaluations_view.description'],
            ['code' => 'clinical_supervisor_evaluations.create', 'module' => 'Clinical Supervisor Evaluations', 'action' => 'CREATE', 'description_key' => 'permissions.clinical_supervisor_evaluations_create.description'],
            ['code' => 'clinical_supervisor_evaluations.approve', 'module' => 'Clinical Supervisor Evaluations', 'action' => 'APPROVE', 'description_key' => 'permissions.clinical_supervisor_evaluations_approve.description'],
            ['code' => 'clinical_supervisor_evaluations.export', 'module' => 'Clinical Supervisor Evaluations', 'action' => 'EXPORT', 'description_key' => 'permissions.clinical_supervisor_evaluations_export.description'],
        ];
        foreach ($permissions as $permission) DB::table('permissions')->updateOrInsert(['code' => $permission['code']], $permission + ['updated_at' => now(), 'created_at' => now()]);
        foreach (['SYS_ADMIN', 'SYSTEM_ADMIN', 'CLINICAL_DIRECTOR', 'DEAN'] as $roleCode) {
            $roleId = DB::table('roles')->where('code', $roleCode)->value('id');
            if (! $roleId) continue;
            foreach (DB::table('permissions')->whereIn('code', array_column($permissions, 'code'))->pluck('id') as $permissionId) {
                DB::table('role_permissions')->updateOrInsert(['role_id' => $roleId, 'permission_id' => $permissionId], ['scope_type' => 'global', 'updated_at' => now(), 'created_at' => now()]);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('clinical_supervisor_evaluations');
        DB::table('permissions')->whereIn('code', ['clinical_supervisor_evaluations.view', 'clinical_supervisor_evaluations.create', 'clinical_supervisor_evaluations.approve', 'clinical_supervisor_evaluations.export'])->delete();
    }

    private function addForeignKeyIfMissing(string $column, string $references, string $name, string $onDelete): void
    {
        // SQLite cannot add foreign keys after creating a table; the production
        // MySQL migration below uses explicit short names to stay under 64 chars.
        if (DB::connection()->getDriverName() !== 'mysql') return;

        $exists = DB::table('information_schema.table_constraints')
            ->where('constraint_schema', DB::getDatabaseName())
            ->where('table_name', 'clinical_supervisor_evaluations')
            ->where('constraint_name', $name)
            ->exists();
        if ($exists) return;

        Schema::table('clinical_supervisor_evaluations', function (Blueprint $table) use ($column, $references, $name, $onDelete) {
            $foreign = $table->foreign($column, $name)->references('id')->on($references);
            $onDelete === 'cascade' ? $foreign->cascadeOnDelete() : $foreign->nullOnDelete();
        });
    }
};
