<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Course;
use App\Models\GradeEntry;
use App\Models\Permission;
use App\Models\Role;
use App\Models\Student;
use App\Models\StudentCourseEnrollment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TransactionIntegrityTest extends TestCase
{
    use RefreshDatabase;

    private User $gradeEditor;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([\Database\Seeders\PermissionSeeder::class]);

        $role = Role::create([
            'code' => 'GRADE_TRANSACTION_TEST',
            'name_key' => 'grade_transaction_test',
            'name_ar' => 'اختبار معاملات العلامات',
            'name_en' => 'Grade transaction test',
        ]);
        $permission = Permission::where('code', 'grades.create')->firstOrFail();
        $role->permissions()->attach($permission->id, ['scope_type' => 'global']);

        $this->gradeEditor = User::factory()->create();
        $this->gradeEditor->roles()->attach($role->id);
    }

    public function test_invalid_batch_rolls_back_without_creating_any_enrollment_or_grade(): void
    {
        $year = AcademicYear::factory()->create(['code' => '2026/2027']);
        $course = Course::factory()->create(['code' => 'TX-101']);
        $studentA = Student::factory()->create();
        $studentB = Student::factory()->create();

        $this->actingAs($this->gradeEditor)->postJson('/api/v1/grade-entries/batch', [
            'course_code' => $course->code,
            'academic_year_id' => $year->id,
            'grades' => [
                ['student_id' => $studentA->id, 'score' => 80, 'max_score' => 100],
                ['student_id' => $studentB->id, 'score' => 120, 'max_score' => 100],
            ],
        ])->assertStatus(422);

        $this->assertDatabaseCount('student_course_enrollments', 0);
        $this->assertDatabaseCount('grade_entries', 0);
    }

    public function test_approved_grade_cannot_be_overwritten_or_returned_to_draft(): void
    {
        $year = AcademicYear::factory()->create();
        $course = Course::factory()->create();
        $student = Student::factory()->create();
        $enrollment = StudentCourseEnrollment::create([
            'student_id' => $student->id,
            'course_id' => $course->id,
            'academic_year_id' => $year->id,
            'semester' => 'FIRST',
            'status' => 'enrolled',
        ]);
        $grade = GradeEntry::create([
            'student_course_enrollment_id' => $enrollment->id,
            'score' => 90,
            'max_score' => 100,
            'status' => 'approved',
        ]);

        $this->actingAs($this->gradeEditor)->postJson('/api/v1/grade-entries', [
            'student_course_enrollment_id' => $enrollment->id,
            'score' => 50,
            'max_score' => 100,
        ])->assertStatus(422);

        $grade->refresh();
        $this->assertSame('approved', $grade->status);
        $this->assertSame('90.00', (string) $grade->score);
    }
}
