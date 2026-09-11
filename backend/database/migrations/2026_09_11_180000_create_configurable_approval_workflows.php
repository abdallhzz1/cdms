<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('approval_workflows', function (Blueprint $table) {
            $table->id();
            $table->string('code', 80)->unique();
            $table->string('name_ar');
            $table->string('name_en');
            $table->text('description_ar')->nullable();
            $table->text('description_en')->nullable();
            $table->boolean('is_active')->default(true);
            $table->boolean('prevent_requester_approval')->default(true);
            $table->boolean('require_distinct_approvers')->default(true);
            $table->foreignId('updated_by')->nullable();
            $table->timestamps();
            $table->foreign('updated_by', 'aw_updated_by_fk')->references('id')->on('users')->nullOnDelete();
        });

        Schema::create('approval_workflow_steps', function (Blueprint $table) {
            $table->id();
            $table->foreignId('approval_workflow_id');
            $table->unsignedTinyInteger('step_order');
            $table->string('name_ar');
            $table->string('name_en');
            $table->json('role_codes');
            $table->timestamps();
            $table->foreign('approval_workflow_id', 'aws_workflow_fk')->references('id')->on('approval_workflows')->cascadeOnDelete();
            $table->unique(['approval_workflow_id', 'step_order'], 'aws_workflow_order_uq');
        });

        Schema::create('approval_requests', function (Blueprint $table) {
            $table->id();
            $table->uuid('public_id')->unique();
            $table->foreignId('approval_workflow_id');
            $table->string('subject_type', 80);
            $table->string('subject_id', 191);
            $table->string('title_ar');
            $table->string('title_en');
            $table->string('source_url', 500)->nullable();
            $table->json('context')->nullable();
            $table->string('status', 24)->default('pending');
            $table->unsignedTinyInteger('current_step_order')->default(1);
            $table->foreignId('requested_by');
            $table->timestamp('requested_at');
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('returned_at')->nullable();
            $table->timestamps();
            $table->foreign('approval_workflow_id', 'ar_workflow_fk')->references('id')->on('approval_workflows')->restrictOnDelete();
            $table->foreign('requested_by', 'ar_requester_fk')->references('id')->on('users')->restrictOnDelete();
            $table->index(['subject_type', 'subject_id'], 'ar_subject_idx');
            $table->index(['status', 'current_step_order'], 'ar_queue_idx');
        });

        Schema::create('approval_actions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('approval_request_id');
            $table->foreignId('approval_workflow_step_id')->nullable();
            $table->foreignId('actor_user_id');
            $table->string('action', 24);
            $table->text('comment')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamp('acted_at');
            $table->timestamps();
            $table->foreign('approval_request_id', 'aa_request_fk')->references('id')->on('approval_requests')->cascadeOnDelete();
            $table->foreign('approval_workflow_step_id', 'aa_step_fk')->references('id')->on('approval_workflow_steps')->nullOnDelete();
            $table->foreign('actor_user_id', 'aa_actor_fk')->references('id')->on('users')->restrictOnDelete();
            $table->index(['approval_request_id', 'acted_at'], 'aa_request_time_idx');
        });

        $now = now();
        $permissions = [
            ['code' => 'approval_workflows.view', 'module' => 'Approval Workflows', 'action' => 'VIEW', 'description_key' => 'permissions.approval_workflows_view.description'],
            ['code' => 'approval_workflows.manage', 'module' => 'Approval Workflows', 'action' => 'MANAGE', 'description_key' => 'permissions.approval_workflows_manage.description'],
            ['code' => 'approvals.view', 'module' => 'Approvals', 'action' => 'VIEW', 'description_key' => 'permissions.approvals_view.description'],
            ['code' => 'approvals.decide', 'module' => 'Approvals', 'action' => 'DECIDE', 'description_key' => 'permissions.approvals_decide.description'],
        ];
        foreach ($permissions as $permission) {
            DB::table('permissions')->updateOrInsert(['code' => $permission['code']], $permission + ['created_at' => $now, 'updated_at' => $now]);
        }

        $grantMap = [
            'SYS_ADMIN' => ['approval_workflows.view', 'approval_workflows.manage', 'approvals.view'],
            'CLINICAL_DIRECTOR' => ['approval_workflows.view', 'approvals.view', 'approvals.decide'],
            'DEAN' => ['approval_workflows.view', 'approvals.view', 'approvals.decide'],
            'VICE_DEAN' => ['approvals.view', 'approvals.decide'],
            'DEPARTMENT_HEAD' => ['approvals.view', 'approvals.decide'],
        ];
        foreach ($grantMap as $roleCode => $codes) {
            $roleId = DB::table('roles')->where('code', $roleCode)->value('id');
            if (! $roleId) continue;
            foreach (DB::table('permissions')->whereIn('code', $codes)->pluck('id') as $permissionId) {
                DB::table('role_permissions')->updateOrInsert(
                    ['role_id' => $roleId, 'permission_id' => $permissionId],
                    ['scope_type' => 'global', 'created_at' => $now, 'updated_at' => $now],
                );
            }
        }

        $defaults = [
            'grade_sheet' => ['اعتماد كشوف العلامات', 'Grade sheet approval', true, true, [['مراجعة مدير الدائرة', 'Clinical Director review', ['CLINICAL_DIRECTOR']], ['الاعتماد النهائي للعمادة', 'Dean final approval', ['DEAN', 'VICE_DEAN']]]],
            'clinical_distribution' => ['اعتماد التوزيع السريري', 'Clinical distribution approval', false, true, [['مراجعة مدير الدائرة', 'Clinical Director review', ['CLINICAL_DIRECTOR']], ['اعتماد العمادة', 'Dean approval', ['DEAN', 'VICE_DEAN']]]],
            'course_report' => ['اعتماد تقارير المساقات', 'Course report approval', true, true, [['مراجعة مدير الدائرة', 'Clinical Director review', ['CLINICAL_DIRECTOR']], ['اعتماد العمادة', 'Dean approval', ['DEAN', 'VICE_DEAN']]]],
            'department_head_evaluation' => ['اعتماد تقييم رئيس القسم', 'Department head evaluation approval', true, false, [['اعتماد العمادة', 'Dean approval', ['DEAN', 'VICE_DEAN']]]],
            'clinical_supervisor_evaluation' => ['اعتماد تقييم المشرف السريري', 'Clinical supervisor evaluation approval', true, false, [['اعتماد العمادة', 'Dean approval', ['DEAN', 'VICE_DEAN']]]],
            'meeting_minutes' => ['اعتماد محاضر الاجتماعات', 'Meeting minutes approval', true, false, [['اعتماد رئيس الجلسة', 'Chair approval', ['CLINICAL_DIRECTOR', 'DEAN', 'VICE_DEAN']]]],
            'correspondence' => ['اعتماد المعاملات والمراسلات', 'Correspondence approval', true, false, [['اعتماد الجهة المخولة', 'Authorized office approval', ['CLINICAL_DIRECTOR', 'DEAN', 'VICE_DEAN']]]],
        ];
        foreach ($defaults as $code => [$ar, $en, $preventSelf, $distinct, $steps]) {
            $workflowId = DB::table('approval_workflows')->insertGetId([
                'code' => $code, 'name_ar' => $ar, 'name_en' => $en,
                'description_ar' => 'مسار قابل للتعديل من إدارة النظام.',
                'description_en' => 'Configurable workflow managed by system administration.',
                'is_active' => true, 'prevent_requester_approval' => $preventSelf,
                'require_distinct_approvers' => $distinct, 'created_at' => $now, 'updated_at' => $now,
            ]);
            foreach ($steps as $index => [$stepAr, $stepEn, $roles]) {
                DB::table('approval_workflow_steps')->insert([
                    'approval_workflow_id' => $workflowId, 'step_order' => $index + 1,
                    'name_ar' => $stepAr, 'name_en' => $stepEn, 'role_codes' => json_encode($roles),
                    'created_at' => $now, 'updated_at' => $now,
                ]);
            }
        }

        // Final workflow approval now replaces the old, unimplemented grade
        // publication permission. Removing it avoids exposing a control that
        // had no route or business effect.
        $legacyGradePublishId = DB::table('permissions')->where('code', 'grades.publish')->value('id');
        if ($legacyGradePublishId) {
            DB::table('role_permissions')->where('permission_id', $legacyGradePublishId)->delete();
            DB::table('permissions')->where('id', $legacyGradePublishId)->delete();
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('approval_actions');
        Schema::dropIfExists('approval_requests');
        Schema::dropIfExists('approval_workflow_steps');
        Schema::dropIfExists('approval_workflows');
        $permissionIds = DB::table('permissions')->whereIn('code', ['approval_workflows.view', 'approval_workflows.manage', 'approvals.view', 'approvals.decide'])->pluck('id');
        DB::table('role_permissions')->whereIn('permission_id', $permissionIds)->delete();
        DB::table('permissions')->whereIn('id', $permissionIds)->delete();
        DB::table('permissions')->updateOrInsert(['code' => 'grades.publish'], [
            'module' => 'Grades', 'action' => 'PUBLISH', 'description_key' => 'permissions.grades_publish.description',
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }
};
