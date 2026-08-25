<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Course;
use App\Models\Permission;
use App\Models\Role;
use App\Models\Student;
use App\Models\User;
use App\Models\GradeEntry;
use App\Models\StudentCourseEnrollment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GradeAndRtaIntegrationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([\Database\Seeders\PermissionSeeder::class, \Database\Seeders\RoleSeeder::class]);
    }

    public function test_rta_without_cohort_sees_no_grade_roster_and_assignment_is_enforced(): void
    {
        $year = AcademicYear::factory()->create();
        $course = Course::factory()->create(['academic_level' => 'fourth']);
        $fourth = Student::factory()->create(['academic_level' => 'fourth', 'registration_status' => 'active']);
        Student::factory()->create(['academic_level' => 'fifth', 'registration_status' => 'active']);

        $rtaRole = Role::where('code', 'RTA')->firstOrFail();
        $rtaRole->permissions()->syncWithoutDetaching([
            Permission::where('code', 'grades.view')->firstOrFail()->id => ['scope_type' => 'global'],
        ]);
        $rta = User::factory()->create(['assigned_levels' => null]);
        $rta->roles()->attach($rtaRole, ['scope_type' => 'global']);

        $url = "/api/v1/grade-entries/roster?course_id={$course->id}&academic_year_id={$year->id}";
        $this->actingAs($rta)->getJson($url)->assertOk()->assertJsonCount(0, 'data');

        $rta->update(['assigned_levels' => ['fourth']]);
        $this->actingAs($rta)->getJson($url)
            ->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.student.id', $fourth->id);
    }

    public function test_only_assignment_manager_can_change_rta_cohorts(): void
    {
        $rta = User::factory()->create();
        $rta->roles()->attach(Role::where('code', 'RTA')->firstOrFail());

        $this->actingAs(User::factory()->create())
            ->putJson("/api/v1/users/{$rta->id}/assign-levels", ['assigned_levels' => ['fourth']])
            ->assertForbidden();

        $managerRole = Role::create(['code' => 'RTA_ASSIGNMENT_MANAGER', 'name_key' => 'rta.manager', 'name_ar' => 'مدير تكليف', 'name_en' => 'RTA manager']);
        $managerRole->permissions()->attach(
            Permission::where('code', 'rta_assignments.manage')->firstOrFail()->id,
            ['scope_type' => 'global'],
        );
        $manager = User::factory()->create();
        $manager->roles()->attach($managerRole);

        $this->actingAs($manager)
            ->putJson("/api/v1/users/{$rta->id}/assign-levels", ['assigned_levels' => ['fourth', 'fifth']])
            ->assertOk()->assertJsonPath('data.assigned_levels.1', 'fifth');
        $this->assertSame(['fourth', 'fifth'], $rta->fresh()->assigned_levels);
    }

    public function test_grade_batch_cannot_spoof_the_official_clinical_component(): void
    {
        $year = AcademicYear::factory()->create();
        $course = Course::factory()->create(['academic_level' => 'fourth']);
        $student = Student::factory()->create(['academic_level' => 'fourth']);
        $role = Role::create(['code' => 'GRADE_EDITOR_INTEGRATION', 'name_key' => 'grade.editor', 'name_ar' => 'راصد', 'name_en' => 'Editor']);
        $role->permissions()->attach(Permission::where('code', 'grades.create')->firstOrFail()->id, ['scope_type' => 'global']);
        $editor = User::factory()->create(); $editor->roles()->attach($role);

        $this->actingAs($editor)->postJson('/api/v1/grade-entries/batch', [
            'course_code' => $course->code, 'academic_year_id' => $year->id,
            'grades' => [['student_id' => $student->id, 'clinical_score' => 20, 'osce_score' => 40, 'written_score' => 40, 'max_score' => 100]],
        ])->assertOk();

        $this->assertDatabaseHas('grade_entries', [
            'clinical_score' => null, 'score' => null, 'osce_score' => 40, 'written_score' => 40,
        ]);
    }

    public function test_complete_grade_sheet_requires_separate_preparer_and_approver(): void
    {
        $year = AcademicYear::factory()->create();
        $course = Course::factory()->create(['academic_level' => 'fourth']);
        $student = Student::factory()->create(['academic_level' => 'fourth']);
        $enrollment = StudentCourseEnrollment::create([
            'student_id' => $student->id, 'course_id' => $course->id,
            'academic_year_id' => $year->id, 'semester' => 'FIRST', 'status' => 'enrolled',
        ]);
        $editorRole = Role::create(['code' => 'GRADE_WORKFLOW_EDITOR', 'name_key' => 'grade.workflow.editor', 'name_ar' => 'معد', 'name_en' => 'Editor']);
        foreach (Permission::whereIn('code', ['grades.create', 'grades.approve'])->get() as $permission) {
            $editorRole->permissions()->attach($permission->id, ['scope_type' => 'global']);
        }
        $editor = User::factory()->create(); $editor->roles()->attach($editorRole);
        GradeEntry::create([
            'student_course_enrollment_id' => $enrollment->id, 'clinical_score' => 18,
            'osce_score' => 35, 'written_score' => 37, 'score' => 90, 'max_score' => 100,
            'status' => 'draft', 'prepared_by_user_id' => $editor->id,
        ]);
        $payload = ['course_code' => $course->code, 'academic_year_id' => $year->id];
        $this->actingAs($editor)->postJson('/api/v1/grade-entries/batch-submit', $payload)->assertOk();
        $this->actingAs($editor)->postJson('/api/v1/grade-entries/batch-approve', $payload)->assertUnprocessable();

        $reviewer = User::factory()->create(); $reviewer->roles()->attach($editorRole);
        $this->actingAs($reviewer)->postJson('/api/v1/grade-entries/batch-approve', $payload)->assertOk();
        $this->assertDatabaseHas('grade_entries', ['student_course_enrollment_id' => $enrollment->id, 'status' => 'approved', 'approved_by_user_id' => $reviewer->id]);
        $this->assertDatabaseCount('workflow_transition_logs', 2);
    }
}
