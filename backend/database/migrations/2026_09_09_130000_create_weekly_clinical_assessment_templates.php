<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('clinical_assessment_templates', function (Blueprint $table) {
            $table->id();
            $table->string('name_ar');
            $table->string('name_en')->nullable();
            $table->foreignId('course_id')->nullable();
            $table->unsignedSmallInteger('version')->default(1);
            $table->decimal('total_score', 5, 2)->default(10);
            $table->boolean('is_active')->default(true)->index();
            $table->foreignId('created_by_user_id')->nullable();
            $table->timestamps();
            $table->foreign('course_id', 'cat_course_fk')->references('id')->on('courses')->nullOnDelete();
            $table->foreign('created_by_user_id', 'cat_creator_fk')->references('id')->on('users')->nullOnDelete();
            $table->index(['course_id', 'is_active'], 'cat_scope_active_idx');
        });

        Schema::create('clinical_assessment_criteria', function (Blueprint $table) {
            $table->id();
            $table->foreignId('template_id');
            $table->string('code', 60);
            $table->string('name_ar');
            $table->string('name_en')->nullable();
            $table->decimal('max_score', 5, 2);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
            $table->foreign('template_id', 'cac_template_fk')->references('id')->on('clinical_assessment_templates')->cascadeOnDelete();
            $table->unique(['template_id', 'code'], 'cac_template_code_uq');
        });

        Schema::table('clinical_assessments', function (Blueprint $table) {
            $table->foreignId('assessment_template_id')->nullable()->after('evaluator_person_id');
            $table->foreignId('student_clinical_assignment_id')->nullable()->after('assessment_template_id');
            $table->unsignedSmallInteger('evaluation_week')->nullable()->after('student_clinical_assignment_id');
            $table->date('week_start')->nullable()->after('evaluation_week');
            $table->date('week_end')->nullable()->after('week_start');
            $table->json('criteria_scores')->nullable()->after('max_score');
            $table->foreign('assessment_template_id', 'ca_template_fk')->references('id')->on('clinical_assessment_templates')->nullOnDelete();
            $table->foreign('student_clinical_assignment_id', 'ca_assignment_fk')->references('id')->on('student_clinical_assignments')->nullOnDelete();
            $table->unique(['student_clinical_assignment_id', 'evaluation_week', 'evaluator_person_id'], 'ca_assign_week_eval_uq');
        });

        $now = now();
        $templateId = DB::table('clinical_assessment_templates')->insertGetId([
            'name_ar' => 'نموذج التقييم السريري الأسبوعي',
            'name_en' => 'Weekly Clinical Assessment',
            'version' => 1,
            'total_score' => 10,
            'is_active' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        DB::table('clinical_assessment_criteria')->insert([
            ['template_id' => $templateId, 'code' => 'history_taking', 'name_ar' => 'أخذ التاريخ المرضي', 'name_en' => 'History Taking', 'max_score' => 2, 'sort_order' => 1, 'created_at' => $now, 'updated_at' => $now],
            ['template_id' => $templateId, 'code' => 'physical_examination', 'name_ar' => 'الفحص السريري', 'name_en' => 'Physical Examination', 'max_score' => 2, 'sort_order' => 2, 'created_at' => $now, 'updated_at' => $now],
            ['template_id' => $templateId, 'code' => 'knowledge_progress', 'name_ar' => 'التطور المعرفي', 'name_en' => 'Knowledge Progress', 'max_score' => 2, 'sort_order' => 3, 'created_at' => $now, 'updated_at' => $now],
            ['template_id' => $templateId, 'code' => 'presentation_skills', 'name_ar' => 'مهارات العرض ومناقشة الحالات', 'name_en' => 'Presentation Skills', 'max_score' => 2, 'sort_order' => 4, 'created_at' => $now, 'updated_at' => $now],
            ['template_id' => $templateId, 'code' => 'professionalism', 'name_ar' => 'المهنية والسلوك والهندام', 'name_en' => 'Professionalism, Attitude and Dress Code', 'max_score' => 2, 'sort_order' => 5, 'created_at' => $now, 'updated_at' => $now],
        ]);

        $permissionId = DB::table('permissions')->where('code', 'assessment.criteria.manage')->value('id');
        if (! $permissionId) {
            $permissionId = DB::table('permissions')->insertGetId([
                'code' => 'assessment.criteria.manage',
                'module' => 'Assessment',
                'action' => 'MANAGE_CRITERIA',
                'description_key' => 'permissions.assessment_criteria_manage.description',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
        $adminRoleId = DB::table('roles')->where('code', 'SYS_ADMIN')->value('id');
        if ($adminRoleId) {
            DB::table('role_permissions')->updateOrInsert(
                ['role_id' => $adminRoleId, 'permission_id' => $permissionId],
                ['scope_type' => 'global', 'created_at' => $now, 'updated_at' => $now],
            );
        }
    }

    public function down(): void
    {
        Schema::table('clinical_assessments', function (Blueprint $table) {
            $table->dropForeign('ca_template_fk');
            $table->dropForeign('ca_assignment_fk');
            $table->dropUnique('ca_assign_week_eval_uq');
            $table->dropColumn(['assessment_template_id', 'student_clinical_assignment_id', 'evaluation_week', 'week_start', 'week_end', 'criteria_scores']);
        });
        Schema::dropIfExists('clinical_assessment_criteria');
        Schema::dropIfExists('clinical_assessment_templates');
    }
};
