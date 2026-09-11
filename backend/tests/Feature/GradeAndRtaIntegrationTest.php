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
use App\Models\AttendanceRecord;
use App\Models\ClinicalSession;
use App\Models\ClinicalAssessment;
use App\Models\Department;
use App\Models\DistributionVersion;
use App\Models\Rotation;
use App\Models\RotationBlock;
use App\Models\StudentClinicalAssignment;
use App\Models\TrainingSite;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
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
        $fifthCourse = Course::factory()->create(['academic_level' => 'fifth']);
        $fourth = Student::factory()->create(['academic_level' => 'fourth', 'registration_status' => 'active']);
        $fifth = Student::factory()->create(['academic_level' => 'fifth', 'registration_status' => 'active']);

        $rtaRole = Role::where('code', 'RTA')->firstOrFail();
        foreach (Permission::whereIn('code', ['grades.view', 'students.view'])->get() as $permission) {
            $rtaRole->permissions()->syncWithoutDetaching([$permission->id => ['scope_type' => 'global']]);
        }
        $rta = User::factory()->create(['assigned_levels' => null]);
        $rta->roles()->attach($rtaRole, ['scope_type' => 'global']);

        $url = "/api/v1/grade-entries/roster?course_id={$course->id}&academic_year_id={$year->id}";
        $this->actingAs($rta)->getJson($url)->assertOk()->assertJsonCount(0, 'data');

        $rta->update(['assigned_levels' => ['fourth']]);
        $this->actingAs($rta)->getJson($url)
            ->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.student.id', $fourth->id);

        $this->actingAs($rta)->getJson('/api/v1/grade-entries/options')
            ->assertOk()
            ->assertJsonCount(1, 'data.courses')
            ->assertJsonPath('data.courses.0.id', $course->id);

        $this->actingAs($rta)->getJson('/api/v1/students?per_page=100')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $fourth->id);

        $this->actingAs($rta)->getJson("/api/v1/grade-entries/roster?course_id={$fifthCourse->id}&academic_year_id={$year->id}")
            ->assertForbidden();
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

    public function test_rta_schedule_and_attendance_are_limited_to_the_assigned_cohort(): void
    {
        $year = AcademicYear::factory()->create();
        $rtaDepartment = Department::factory()->create();
        $department = Department::factory()->create();
        $site = TrainingSite::factory()->create();
        $rtaRole = Role::where('code', 'RTA')->firstOrFail();
        foreach (Permission::whereIn('code', ['clinical_schedule.view', 'attendance.view'])->get() as $permission) {
            $rtaRole->permissions()->syncWithoutDetaching([$permission->id => ['scope_type' => 'global']]);
        }
        $rta = User::factory()->create(['assigned_levels' => ['fourth']]);
        $rta->roles()->attach($rtaRole, ['scope_type' => 'department', 'scope_id' => $rtaDepartment->id]);

        $assignments = [];
        $records = [];
        foreach (['fourth', 'fifth'] as $index => $level) {
            $course = Course::factory()->create(['academic_level' => $level]);
            $rotation = Rotation::factory()->create([
                'academic_year_id' => $year->id,
                'course_id' => $course->id,
                'academic_level' => $level,
                'start_date' => '2026-09-01',
                'end_date' => '2026-10-31',
            ]);
            $block = RotationBlock::factory()->create([
                'rotation_id' => $rotation->id,
                'department_id' => $department->id,
                'from_week' => 1,
                'to_week' => 4,
            ]);
            $student = Student::factory()->create([
                'academic_level' => $level,
                'academic_year_id' => $year->id,
                'registration_status' => 'active',
            ]);
            $version = DistributionVersion::create([
                'rotation_id' => $rotation->id,
                'version_number' => 1,
                'status' => 'published',
                'is_current' => true,
            ]);
            $assignments[$level] = StudentClinicalAssignment::create([
                'distribution_version_id' => $version->id,
                'student_id' => $student->id,
                'rotation_block_id' => $block->id,
                'training_site_id' => $site->id,
                'department_id' => $department->id,
            ]);
            $session = ClinicalSession::create([
                'rotation_block_id' => $block->id,
                'training_site_id' => $site->id,
                'session_date' => "2026-09-0".($index + 1),
                'title' => strtoupper($level).' session',
            ]);
            $records[$level] = AttendanceRecord::create([
                'clinical_session_id' => $session->id,
                'student_id' => $student->id,
                'status' => 'present',
            ]);
        }

        $emptyPublishedCourse = Course::factory()->create(['academic_level' => 'fourth']);
        $emptyPublishedRotation = Rotation::factory()->create([
            'academic_year_id' => $year->id,
            'course_id' => $emptyPublishedCourse->id,
            'academic_level' => 'fourth',
            'start_date' => '2026-11-01',
            'end_date' => '2026-12-31',
        ]);
        DistributionVersion::create([
            'rotation_id' => $emptyPublishedRotation->id,
            'version_number' => 1,
            'status' => 'published',
            'is_current' => true,
        ]);

        $this->actingAs($rta)->getJson('/api/v1/operational/clinical-schedule?page=1&per_page=50')
            ->assertOk()
            ->assertJsonCount(1, 'data.data')
            ->assertJsonPath('data.data.0.assignment_id', $assignments['fourth']->id);

        $this->actingAs($rta)->getJson('/api/v1/operational/clinical-schedule-options')
            ->assertOk()
            ->assertJsonCount(2, 'data.rotations')
            ->assertJsonFragment(['id' => $emptyPublishedRotation->id, 'academic_level' => 'fourth']);

        $this->actingAs($rta)->getJson('/api/v1/attendance-records?per_page=100')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $records['fourth']->id);

        $this->actingAs($rta)->getJson('/api/v1/clinical-sessions?per_page=100')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title', 'FOURTH session');
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

    public function test_grade_submission_explains_missing_supervisor_scores_in_request_language_and_refreshes_them(): void
    {
        $year = AcademicYear::factory()->create();
        $course = Course::factory()->create(['academic_level' => 'fourth']);
        $student = Student::factory()->create(['academic_level' => 'fourth', 'registration_status' => 'active']);
        $enrollment = StudentCourseEnrollment::create([
            'student_id' => $student->id, 'course_id' => $course->id,
            'academic_year_id' => $year->id, 'semester' => 'FIRST', 'status' => 'enrolled',
        ]);
        $role = Role::create(['code' => 'GRADE_SUBMISSION_EDITOR', 'name_key' => 'grade.submission.editor', 'name_ar' => 'راصد', 'name_en' => 'Editor']);
        $role->permissions()->attach(Permission::where('code', 'grades.create')->firstOrFail()->id, ['scope_type' => 'global']);
        $editor = User::factory()->create();
        $editor->roles()->attach($role);
        GradeEntry::create([
            'student_course_enrollment_id' => $enrollment->id, 'clinical_score' => null,
            'osce_score' => 35, 'written_score' => 35, 'score' => null, 'max_score' => 100,
            'status' => 'draft', 'prepared_by_user_id' => $editor->id,
        ]);
        $payload = ['course_code' => $course->code, 'academic_year_id' => $year->id];

        $this->actingAs($editor)->withHeader('Accept-Language', 'ar')
            ->postJson('/api/v1/grade-entries/batch-submit', $payload)
            ->assertUnprocessable()->assertJsonPath('errors.grades.0', fn ($message) => str_contains($message, 'التقييم السريري'));
        $this->actingAs($editor)->withHeader('Accept-Language', 'en')
            ->postJson('/api/v1/grade-entries/batch-submit', $payload)
            ->assertUnprocessable()->assertJsonPath('errors.grades.0', fn ($message) => str_contains($message, 'clinical assessment'));

        $rotation = Rotation::factory()->create([
            'course_id' => $course->id, 'academic_year_id' => $year->id, 'academic_level' => 'fourth',
        ]);
        $block = RotationBlock::factory()->create(['rotation_id' => $rotation->id]);
        $session = ClinicalSession::create([
            'rotation_block_id' => $block->id, 'session_date' => '2026-09-10', 'title' => 'Clinical assessment',
        ]);
        ClinicalAssessment::create([
            'student_id' => $student->id, 'clinical_session_id' => $session->id,
            'score' => 9, 'max_score' => 10, 'status' => 'approved',
        ]);

        $this->actingAs($editor)->withHeader('Accept-Language', 'ar')
            ->postJson('/api/v1/grade-entries/batch-submit', $payload)->assertOk();
        $this->assertDatabaseHas('grade_entries', [
            'student_course_enrollment_id' => $enrollment->id,
            'clinical_score' => 18, 'score' => 88, 'status' => 'submitted',
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
        $rotation = Rotation::factory()->create([
            'course_id' => $course->id, 'academic_year_id' => $year->id, 'academic_level' => 'fourth',
        ]);
        $block = RotationBlock::factory()->create(['rotation_id' => $rotation->id]);
        $session = ClinicalSession::create([
            'rotation_block_id' => $block->id, 'session_date' => '2026-09-10', 'title' => 'Clinical assessment',
        ]);
        ClinicalAssessment::create([
            'student_id' => $student->id, 'clinical_session_id' => $session->id,
            'score' => 9, 'max_score' => 10, 'status' => 'approved',
        ]);
        $payload = ['course_code' => $course->code, 'academic_year_id' => $year->id];
        $this->actingAs($editor)->postJson('/api/v1/grade-entries/batch-submit', $payload)->assertOk();
        $this->actingAs($editor)->postJson('/api/v1/grade-entries/batch-approve', $payload)->assertUnprocessable();

        $directorRole = Role::where('code', 'CLINICAL_DIRECTOR')->firstOrFail();
        $deanRole = Role::where('code', 'DEAN')->firstOrFail();
        foreach ([$directorRole, $deanRole] as $role) {
            foreach (Permission::whereIn('code', ['grades.view', 'grades.approve', 'approvals.decide'])->get() as $permission) {
                $role->permissions()->syncWithoutDetaching([$permission->id => ['scope_type' => 'global']]);
            }
        }
        $reviewer = User::factory()->create(); $reviewer->roles()->attach($directorRole);
        $this->actingAs($reviewer)->postJson('/api/v1/grade-entries/batch-approve', $payload)->assertOk();
        $this->assertDatabaseHas('grade_entries', ['student_course_enrollment_id' => $enrollment->id, 'status' => 'submitted']);
        $this->actingAs($reviewer)->getJson('/api/v1/grade-entries/approval-status?course_id='.$course->id.'&academic_year_id='.$year->id)
            ->assertOk()
            ->assertJsonPath('data.current_step_order', 2)
            ->assertJsonPath('data.acted_by_me', true)
            ->assertJsonPath('data.can_act', false)
            ->assertJsonPath('data.current_step_name_en', 'Dean final approval');

        $dean = User::factory()->create(); $dean->roles()->attach($deanRole);
        $this->actingAs($dean)->postJson('/api/v1/grade-entries/batch-approve', $payload)->assertOk();
        $this->assertDatabaseHas('grade_entries', ['student_course_enrollment_id' => $enrollment->id, 'status' => 'approved', 'approved_by_user_id' => $dean->id]);
        $this->assertDatabaseCount('workflow_transition_logs', 2);
    }

    public function test_new_student_can_be_added_without_reopening_submitted_grade_rows(): void
    {
        $year = AcademicYear::factory()->create();
        $course = Course::factory()->create(['academic_level' => 'fourth']);
        $oldStudent = Student::factory()->create(['academic_level' => 'fourth', 'registration_status' => 'active']);
        $newStudent = Student::factory()->create(['academic_level' => 'fourth', 'registration_status' => 'active']);
        $oldEnrollment = StudentCourseEnrollment::create([
            'student_id' => $oldStudent->id, 'course_id' => $course->id,
            'academic_year_id' => $year->id, 'semester' => 'FIRST', 'status' => 'enrolled',
        ]);

        $role = Role::create(['code' => 'GRADE_SUPPLEMENT_EDITOR', 'name_key' => 'grade.supplement.editor', 'name_ar' => 'معد', 'name_en' => 'Editor']);
        $role->permissions()->attach(Permission::where('code', 'grades.create')->firstOrFail()->id, ['scope_type' => 'global']);
        $editor = User::factory()->create();
        $editor->roles()->attach($role);

        GradeEntry::create([
            'student_course_enrollment_id' => $oldEnrollment->id, 'clinical_score' => 18,
            'osce_score' => 35, 'written_score' => 37, 'score' => 90, 'max_score' => 100,
            'status' => 'submitted', 'prepared_by_user_id' => $editor->id, 'submitted_at' => now(),
        ]);

        $rotation = Rotation::factory()->create([
            'course_id' => $course->id, 'academic_year_id' => $year->id, 'academic_level' => 'fourth',
        ]);
        $block = RotationBlock::factory()->create(['rotation_id' => $rotation->id]);
        $session = ClinicalSession::create([
            'rotation_block_id' => $block->id, 'session_date' => '2026-09-10', 'title' => 'Clinical assessment',
        ]);
        ClinicalAssessment::create([
            'student_id' => $newStudent->id, 'clinical_session_id' => $session->id,
            'score' => 8.5, 'max_score' => 10, 'status' => 'submitted',
        ]);

        $savePayload = [
            'course_code' => $course->code, 'academic_year_id' => $year->id,
            'grades' => [[
                'student_id' => $newStudent->id, 'osce_score' => 36,
                'written_score' => 38, 'max_score' => 100,
            ]],
        ];
        $this->actingAs($editor)->postJson('/api/v1/grade-entries/batch', $savePayload)->assertOk();

        $newEnrollment = StudentCourseEnrollment::where('student_id', $newStudent->id)
            ->where('course_id', $course->id)->where('academic_year_id', $year->id)->firstOrFail();
        $this->assertDatabaseHas('grade_entries', [
            'student_course_enrollment_id' => $oldEnrollment->id, 'status' => 'submitted', 'score' => 90,
        ]);
        $this->assertDatabaseHas('grade_entries', [
            'student_course_enrollment_id' => $newEnrollment->id, 'status' => 'draft',
            'clinical_score' => 17, 'osce_score' => 36, 'written_score' => 38, 'score' => 91,
        ]);

        $sheet = ['course_code' => $course->code, 'academic_year_id' => $year->id];
        $this->actingAs($editor)->postJson('/api/v1/grade-entries/batch-submit', $sheet)->assertOk();
        $this->assertDatabaseHas('grade_entries', [
            'student_course_enrollment_id' => $newEnrollment->id, 'status' => 'submitted',
        ]);
        $this->assertDatabaseCount('approval_requests', 1);

        $directorRole = Role::where('code', 'CLINICAL_DIRECTOR')->firstOrFail();
        foreach (Permission::whereIn('code', ['grades.approve', 'approvals.decide'])->get() as $permission) {
            $directorRole->permissions()->syncWithoutDetaching([$permission->id => ['scope_type' => 'global']]);
        }
        $director = User::factory()->create();
        $director->roles()->attach($directorRole);
        $this->actingAs($director)->postJson('/api/v1/grade-entries/batch-approve', $sheet)->assertOk();
        $firstRequestId = DB::table('approval_requests')->where('status', 'pending')->where('current_step_order', 2)->value('id');
        $this->assertNotNull($firstRequestId);

        $lateStudent = Student::factory()->create(['academic_level' => 'fourth', 'registration_status' => 'active']);
        ClinicalAssessment::create([
            'student_id' => $lateStudent->id, 'clinical_session_id' => $session->id,
            'score' => 9, 'max_score' => 10, 'status' => 'submitted',
        ]);
        $this->actingAs($editor)->postJson('/api/v1/grade-entries/batch', [
            'course_code' => $course->code, 'academic_year_id' => $year->id,
            'grades' => [[
                'student_id' => $lateStudent->id, 'osce_score' => 35,
                'written_score' => 37, 'max_score' => 100,
            ]],
        ])->assertOk();
        $this->actingAs($editor)->postJson('/api/v1/grade-entries/batch-submit', $sheet)->assertOk();

        $this->assertDatabaseHas('approval_requests', ['id' => $firstRequestId, 'status' => 'cancelled']);
        $this->assertDatabaseHas('approval_requests', ['status' => 'pending', 'current_step_order' => 1]);
    }
}
