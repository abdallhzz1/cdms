<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Course;
use App\Models\Permission;
use App\Models\Role;
use App\Models\Student;
use App\Models\StudentCourseEnrollment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CourseManagementWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([\Database\Seeders\PermissionSeeder::class, \Database\Seeders\RoleSeeder::class]);

        $role = Role::create(['code' => 'COURSE_MANAGER_TEST', 'name_key' => 'test', 'name_ar' => 'اختبار', 'name_en' => 'Test']);
        $ids = Permission::whereIn('code', ['courses.view', 'courses.manage', 'course_report.manage', 'course_report.approve'])->pluck('id');
        $role->permissions()->sync($ids->mapWithKeys(fn (int $id) => [$id => ['scope_type' => 'global']])->all());
        $this->manager = User::factory()->create();
        $this->manager->roles()->attach($role);
    }

    public function test_course_directory_filters_paginates_and_rejects_duplicate_codes(): void
    {
        Course::factory()->count(3)->create(['academic_level' => 'fourth', 'semester' => 1]);
        Course::factory()->count(2)->create(['academic_level' => 'fifth', 'semester' => 2]);

        $this->actingAs($this->manager)->getJson('/api/v1/courses?with_pagination=1&per_page=2&academic_level=fourth')
            ->assertOk()
            ->assertJsonCount(2, 'data.items')
            ->assertJsonPath('data.pagination.total', 3)
            ->assertJsonPath('data.summary.total', 5);

        $course = Course::firstOrFail();
        $this->actingAs($this->manager)->postJson('/api/v1/courses', [
            'code' => $course->code,
            'name_ar' => 'مكرر',
            'credit_hours' => 4,
            'academic_level' => 'fourth',
            'semester' => 1,
        ])->assertUnprocessable()->assertJsonValidationErrors('code');

        $this->actingAs($this->manager)->postJson('/api/v1/courses', [
            'code' => 'CLIN-NO-SEMESTER',
            'name_ar' => 'مساق سريري دون تصنيف فصل',
            'credit_hours' => 4,
            'academic_level' => 'fourth',
        ])->assertCreated()->assertJsonPath('data.semester', 1);
    }

    public function test_course_detail_resources_validate_weights_outcomes_and_program_mappings(): void
    {
        $course = Course::factory()->create();
        DB::table('program_outcomes')->insert([
            'code' => 'PLO-T1', 'name_en' => 'Outcome', 'name_ar' => 'مخرج',
            'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->actingAs($this->manager)->getJson('/api/v1/program-outcomes')
            ->assertOk()->assertJsonPath('data.0.code', 'PLO-T1');

        $this->actingAs($this->manager)->postJson("/api/v1/courses/{$course->id}/assessment-components", [
            'name' => 'امتحان', 'weight' => 60, 'max_score' => 100,
        ])->assertCreated();
        $this->actingAs($this->manager)->postJson("/api/v1/courses/{$course->id}/assessment-components", [
            'name' => 'تقييم سريري', 'weight' => 50, 'max_score' => 100,
        ])->assertUnprocessable()->assertJsonValidationErrors('weight');

        $this->actingAs($this->manager)->postJson("/api/v1/courses/{$course->id}/learning-outcomes", [
            'outcome_code' => 'ILO-1', 'text_ar' => 'مخرج تعلم',
        ])->assertCreated();
        $this->actingAs($this->manager)->postJson("/api/v1/courses/{$course->id}/learning-outcomes", [
            'outcome_code' => 'ILO-1', 'text_ar' => 'مكرر',
        ])->assertUnprocessable()->assertJsonValidationErrors('outcome_code');

        $this->actingAs($this->manager)->postJson("/api/v1/courses/{$course->id}/program-outcome-mappings", [
            'program_outcome_code' => 'PLO-T1', 'mapping_level' => 'High',
        ])->assertCreated();
        $this->actingAs($this->manager)->postJson("/api/v1/courses/{$course->id}/program-outcome-mappings", [
            'program_outcome_code' => 'PLO-MISSING', 'mapping_level' => 'High',
        ])->assertUnprocessable()->assertJsonValidationErrors('program_outcome_code');
    }

    public function test_archiving_a_referenced_course_preserves_related_records(): void
    {
        $course = Course::factory()->create(['is_active' => true]);
        $year = AcademicYear::factory()->create();
        $student = Student::factory()->create();
        $enrollment = StudentCourseEnrollment::create([
            'student_id' => $student->id,
            'course_id' => $course->id,
            'academic_year_id' => $year->id,
            'semester' => '1',
            'status' => 'enrolled',
        ]);

        $this->actingAs($this->manager)->deleteJson("/api/v1/courses/{$course->id}")->assertOk();
        $this->assertFalse($course->fresh()->is_active);
        $this->assertDatabaseHas('student_course_enrollments', ['id' => $enrollment->id]);
    }

    public function test_course_report_moves_from_draft_to_submitted_and_approved(): void
    {
        $course = Course::factory()->create();
        $year = AcademicYear::factory()->create(['is_current' => true]);

        $stored = $this->actingAs($this->manager)->postJson("/api/v1/courses/{$course->id}/reports", [
            'academic_year_id' => $year->id,
            'summary' => 'تم تنفيذ المساق.',
            'achievements' => 'إنجازات',
            'challenges' => 'تحديات',
            'improvement_plan' => 'خطة تحسين',
        ])->assertOk()->assertJsonPath('data.status', 'draft');
        $reportId = $stored->json('data.id');

        $this->actingAs($this->manager)->postJson("/api/v1/courses/{$course->id}/reports/{$reportId}/submit")
            ->assertOk()->assertJsonPath('data.status', 'submitted');
        $this->actingAs($this->manager)->postJson("/api/v1/courses/{$course->id}/reports/{$reportId}/approve", [
            'review_notes' => 'معتمد',
        ])->assertOk()->assertJsonPath('data.status', 'approved');
    }

    public function test_bulk_import_reports_invalid_rows_without_misclassifying_them(): void
    {
        $this->actingAs($this->manager)->postJson('/api/v1/courses/bulk-import', [
            'courses' => [
                ['code' => 'VALID-501', 'name_ar' => 'مساق صحيح', 'credit_hours' => 4, 'academic_level' => 'fifth', 'semester' => 2],
                ['code' => 'BAD-1', 'name_ar' => 'مساق خاطئ', 'credit_hours' => 4, 'academic_level' => 'unknown'],
            ],
        ])->assertOk()
            ->assertJsonPath('data.imported', 1)
            ->assertJsonCount(1, 'data.errors');

        $this->assertDatabaseHas('courses', ['code' => 'VALID-501', 'academic_level' => 'fifth', 'semester' => 2]);
        $this->assertDatabaseMissing('courses', ['code' => 'BAD-1']);
    }
}
