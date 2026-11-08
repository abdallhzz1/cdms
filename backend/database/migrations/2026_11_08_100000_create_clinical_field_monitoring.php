<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('clinical_field_forms')) {
            Schema::create('clinical_field_forms', function (Blueprint $table) {
                $table->id();
                $table->uuid('public_id')->unique();
                $table->string('reference_number', 40)->unique();
                $table->string('type', 40);
                $table->string('status', 30)->default('draft');
                $table->unsignedInteger('revision')->default(1);
                $table->string('locale', 2)->default('ar');
                $table->foreignId('creator_user_id')->constrained('users')->restrictOnDelete();
                $table->foreignId('recipient_user_id')->constrained('users')->restrictOnDelete();
                $table->foreignId('department_id')->nullable()->constrained()->nullOnDelete();
                $table->foreignId('training_site_id')->nullable()->constrained()->nullOnDelete();
                $table->foreignId('course_id')->nullable()->constrained()->nullOnDelete();
                $table->date('activity_date')->nullable();
                $table->date('period_from')->nullable();
                $table->date('period_to')->nullable();
                $table->json('payload');
                $table->boolean('is_urgent')->default(false);
                $table->text('latest_review_note')->nullable();
                $table->dateTime('submitted_at')->nullable();
                $table->dateTime('acknowledged_at')->nullable();
                $table->dateTime('completed_at')->nullable();
                $table->timestamps();
                $table->index(['creator_user_id', 'status']);
                $table->index(['recipient_user_id', 'status']);
                $table->index(['type', 'activity_date']);
                $table->index(['is_urgent', 'status']);
            });
        }

        if (! Schema::hasTable('clinical_field_form_events')) {
            Schema::create('clinical_field_form_events', function (Blueprint $table) {
                $table->id();
                $table->foreignId('clinical_field_form_id')->constrained('clinical_field_forms')->cascadeOnDelete();
                $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->string('action', 40);
                $table->string('from_status', 30)->nullable();
                $table->string('to_status', 30)->nullable();
                $table->text('note')->nullable();
                $table->json('metadata')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasIndex('clinical_field_form_events', 'cfm_events_form_created_idx')) {
            Schema::table('clinical_field_form_events', function (Blueprint $table) {
                $table->index(['clinical_field_form_id', 'created_at'], 'cfm_events_form_created_idx');
            });
        }

        $permissions = [
            ['clinical_field_monitoring.view', 'VIEW'],
            ['clinical_field_monitoring.create_assistant', 'CREATE_ASSISTANT'],
            ['clinical_field_monitoring.create_department_report', 'CREATE_DEPARTMENT_REPORT'],
            ['clinical_field_monitoring.create_supervisory_visit', 'CREATE_SUPERVISORY_VISIT'],
            ['clinical_field_monitoring.review', 'REVIEW'],
            ['clinical_field_monitoring.export', 'EXPORT'],
            ['clinical_field_monitoring.manage', 'MANAGE'],
        ];

        foreach ($permissions as [$code, $action]) {
            DB::table('permissions')->updateOrInsert(['code' => $code], [
                'module' => 'Clinical Field Monitoring',
                'action' => $action,
                'description_key' => 'permissions.'.str_replace('.', '_', $code).'.description',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $grants = [
            'RTA' => ['clinical_field_monitoring.view', 'clinical_field_monitoring.create_assistant', 'clinical_field_monitoring.export'],
            'DEPARTMENT_HEAD' => ['clinical_field_monitoring.view', 'clinical_field_monitoring.create_department_report', 'clinical_field_monitoring.export'],
            'CLINICAL_DIRECTOR' => ['clinical_field_monitoring.view', 'clinical_field_monitoring.create_supervisory_visit', 'clinical_field_monitoring.review', 'clinical_field_monitoring.export'],
            'DEAN' => ['clinical_field_monitoring.view', 'clinical_field_monitoring.review', 'clinical_field_monitoring.export'],
            'SYS_ADMIN' => ['clinical_field_monitoring.view', 'clinical_field_monitoring.export', 'clinical_field_monitoring.manage'],
        ];

        foreach ($grants as $roleCode => $permissionCodes) {
            $roleId = DB::table('roles')->where('code', $roleCode)->value('id');
            if (! $roleId) {
                continue;
            }
            foreach (DB::table('permissions')->whereIn('code', $permissionCodes)->pluck('id') as $permissionId) {
                DB::table('role_permissions')->updateOrInsert(
                    ['role_id' => $roleId, 'permission_id' => $permissionId],
                    ['scope_type' => 'global', 'created_at' => now(), 'updated_at' => now()],
                );
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('clinical_field_form_events');
        Schema::dropIfExists('clinical_field_forms');
        $permissionIds = DB::table('permissions')->where('module', 'Clinical Field Monitoring')->pluck('id');
        DB::table('role_permissions')->whereIn('permission_id', $permissionIds)->delete();
        DB::table('user_permission_grants')->whereIn('permission_id', $permissionIds)->delete();
        DB::table('permissions')->whereIn('id', $permissionIds)->delete();
    }
};
