<?php

namespace Tests\Feature;

use App\Models\{AcademicYear, AttendanceRecord, ClinicalAssessment, ClinicalSession, Course, Department, DistributionVersion, GradeEntry, Permission, Person, Role, Rotation, RotationBlock, Student, StudentClinicalAssignment, StudentCourseEnrollment, StudentGroup, StudentSubgroup, SupervisorAvailability, TrainingSite, User};
use App\Services\DepartmentHeadCourseScope;
use App\Services\Reports\ReportCenterService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DepartmentHeadCourseScopeTest extends TestCase
{
    use RefreshDatabase;

    private User $head;
    private Department $department;
    private AcademicYear $year;
    private Course $owned;
    private Course $outside;
    private Student $student;
    private Student $other;
    private StudentSubgroup $subgroup;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([\Database\Seeders\PermissionSeeder::class, \Database\Seeders\RoleSeeder::class]);
        $this->department = Department::factory()->create(['code' => 'HEAD-TEST-PED']);
        $this->year = AcademicYear::factory()->create(['is_current' => true]);
        $this->owned = Course::factory()->create(['academic_level' => 'fifth']);
        $this->outside = Course::factory()->create(['academic_level' => 'fifth']);
        $this->owned->departments()->sync([$this->department->id]);
        $this->student = Student::factory()->create(['academic_level' => 'fifth', 'academic_year_id' => $this->year->id]);
        $this->other = Student::factory()->create(['academic_level' => 'fifth', 'academic_year_id' => $this->year->id]);
        $group = StudentGroup::create(['name' => 'A', 'academic_year_id' => $this->year->id, 'academic_level' => 'fifth', 'group_type' => 'self_registration']);
        $this->subgroup = $group->subgroups()->create(['name' => 'A1', 'min_size' => 1, 'max_size' => 20, 'is_active' => true]);
        $this->placement($this->owned, $this->student, $this->subgroup->id);
        $this->placement($this->outside, $this->student);
        $this->placement($this->outside, $this->other);
        $role = Role::where('code', 'DEPARTMENT_HEAD')->firstOrFail();
        Permission::firstOrCreate(['code' => 'groups.view'], ['module' => 'Groups', 'action' => 'VIEW', 'description_key' => 'permissions.groups_view.description']);
        $role->permissions()->syncWithoutDetaching(Permission::whereIn('code', ['courses.view', 'courses.manage', 'students.view', 'students.update', 'groups.view', 'grades.view', 'attendance.review', 'assessment.review', 'distribution.view', 'clinical_schedule.view', 'group_registration.view', 'reports.view', 'reports.export'])->pluck('id')->mapWithKeys(fn ($id) => [$id => ['scope_type' => 'global']])->all());
        $this->head = User::factory()->create(['assigned_levels' => ['fourth', 'fifth', 'sixth']]);
        $this->head->roles()->attach($role, ['scope_type' => 'department', 'scope_id' => $this->department->id]);
        $this->actingAs($this->head);
    }

    private function placement(Course $course, Student $student, ?int $subgroup = null): StudentClinicalAssignment
    {
        $rotation = Rotation::factory()->create(['course_id' => $course->id, 'academic_year_id' => $this->year->id, 'academic_level' => 'fifth', 'start_date' => '2026-09-01', 'end_date' => '2026-12-01']);
        $block = RotationBlock::factory()->create(['rotation_id' => $rotation->id, 'department_id' => null]);
        $version = DistributionVersion::create(['rotation_id' => $rotation->id, 'version_number' => 1, 'status' => 'published', 'is_current' => true]);
        $site = TrainingSite::factory()->create();
        $assignment = StudentClinicalAssignment::create(['distribution_version_id' => $version->id, 'rotation_block_id' => $block->id, 'student_id' => $student->id, 'student_subgroup_id' => $subgroup, 'training_site_id' => $site->id, 'department_id' => null]);
        $session = ClinicalSession::create(['rotation_block_id' => $block->id, 'training_site_id' => $site->id, 'session_date' => '2026-09-28', 'title' => $course->code]);
        AttendanceRecord::create(['student_id' => $student->id, 'clinical_session_id' => $session->id, 'status' => 'present']);
        ClinicalAssessment::create(['student_id' => $student->id, 'clinical_session_id' => $session->id, 'student_clinical_assignment_id' => $assignment->id, 'score' => 9, 'max_score' => 10, 'status' => 'draft']);
        $enrollment = StudentCourseEnrollment::firstOrCreate(['student_id' => $student->id, 'course_id' => $course->id, 'academic_year_id' => $this->year->id, 'semester' => 'annual']);
        GradeEntry::create(['student_course_enrollment_id' => $enrollment->id, 'score' => 80, 'max_score' => 100, 'status' => 'draft']);
        return $assignment;
    }

    public function test_course_ownership_limits_directory_options_details_and_course_roster(): void
    {
        Course::factory()->create(['academic_level' => 'sixth'])->departments()->sync([$this->department->id]);
        $this->getJson('/api/v1/courses')->assertOk()->assertJsonCount(2, 'data');
        $this->getJson('/api/v1/students')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $this->student->id);
        $this->getJson('/api/v1/students/scope-options')->assertOk()->assertJsonPath('data.academic_levels', ['fifth']);
        $this->getJson("/api/v1/students/{$this->other->id}")->assertForbidden();
        $this->getJson("/api/v1/courses/{$this->outside->id}")->assertForbidden();
        $this->getJson("/api/v1/grade-entries/roster?course_id={$this->owned->id}&academic_year_id={$this->year->id}")->assertOk()->assertJsonCount(1, 'data');
        $this->getJson("/api/v1/grade-entries/roster?course_id={$this->outside->id}&academic_year_id={$this->year->id}")->assertForbidden();
        $this->getJson('/api/v1/student-groups')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_same_student_does_not_expose_another_departments_records_or_exports(): void
    {
        $this->getJson('/api/v1/grade-entries')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/attendance-records')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/clinical-assessments')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/operational/clinical-schedule?per_page=50')->assertOk()->assertJsonCount(1, 'data.data');
        foreach (['student_directory', 'grades', 'attendance', 'clinical_assessments', 'clinical_schedule'] as $key) {
            $this->assertCount(1, app(ReportCenterService::class)->report($key, [])['rows'], $key);
        }
        $this->assertFalse(app(ReportCenterService::class)->hasReport('quality_plans'));
    }

    public function test_daily_clinical_groups_do_not_expose_another_departments_course(): void
    {
        $doctor = Person::factory()->create();
        $placements = StudentClinicalAssignment::query()
            ->where('student_id', $this->student->id)
            ->with('rotationBlock.rotation')->get();
        foreach ($placements as $placement) {
            $placement->update(['student_subgroup_id' => $this->subgroup->id, 'supervisor_id' => $doctor->id]);
            SupervisorAvailability::create([
                'person_id' => $doctor->id,
                'training_site_id' => $placement->training_site_id,
                'day' => 'monday',
                'available_from' => '2026-09-01',
                'available_until' => '2026-12-01',
                'status' => 'work',
            ]);
        }

        $this->getJson('/api/v1/operational/clinical-schedule/daily-groups?date=2026-09-07')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.course.id', $this->owned->id)
            ->assertJsonPath('data.0.students.0.id', $this->student->id);
    }

    public function test_missing_department_is_deny_by_default_and_rta_does_not_expand_head_scope(): void
    {
        $this->head->roles()->attach(Role::where('code', 'RTA')->firstOrFail());
        $this->actingAs($this->head->fresh());
        $this->getJson('/api/v1/students')->assertOk()->assertJsonCount(1, 'data');
        $this->head->roles()->updateExistingPivot(Role::where('code', 'DEPARTMENT_HEAD')->value('id'), ['scope_id' => null]);
        $this->actingAs($this->head->fresh());
        $this->getJson('/api/v1/students')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/courses')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/students/scope-options')->assertOk()->assertJsonPath('data.academic_levels', []);
    }

    public function test_global_leadership_role_retains_global_scope_and_public_readers_are_unchanged(): void
    {
        $this->head->roles()->attach(Role::where('code', 'CLINICAL_DIRECTOR')->firstOrFail());
        $this->actingAs($this->head->fresh());
        $this->getJson('/api/v1/courses')->assertOk()->assertJsonCount(2, 'data');
        $this->getJson('/api/v1/students')->assertOk()->assertJsonCount(2, 'data');
        $this->assertNull(app(DepartmentHeadCourseScope::class)->courseIds());
    }

    public function test_only_global_course_manager_can_change_department_ownership(): void
    {
        $otherDepartment = Department::factory()->create();
        $this->putJson("/api/v1/courses/{$this->owned->id}", ['department_ids' => [$otherDepartment->id]])->assertForbidden();
        $this->putJson("/api/v1/courses/{$this->outside->id}", ['name_ar' => 'غير مسموح'])->assertForbidden();
        $this->head->roles()->attach(Role::where('code', 'CLINICAL_DIRECTOR')->firstOrFail());
        $this->actingAs($this->head->fresh());
        $this->putJson("/api/v1/courses/{$this->outside->id}", ['department_ids' => [$this->department->id]])->assertOk()->assertJsonPath('data.departments.0.id', $this->department->id);
        $this->assertDatabaseHas('audit_logs', ['action' => 'course.departments.changed', 'entity_id' => $this->outside->id]);
    }

    public function test_classification_migration_uses_reference_codes_without_rewriting_existing_records(): void
    {
        $examples = ['M1460' => 'DEP-IM', 'M1662' => 'DEP-IM', 'M1687' => 'DEP-IM', 'M1470' => 'DEP-GS', 'M1583' => 'DEP-PED', 'M1688' => 'DEP-PED', 'M1582' => 'DEP-OBG', 'N1471' => 'DEP-IMS', 'M1574' => 'DEP-SSS', 'M1677' => 'DEP-SSS', 'M1593' => 'DEP-FCM'];
        foreach (array_unique($examples) as $code) Department::firstOrCreate(['code' => $code], ['name_ar' => $code]);
        foreach ($examples as $code => $owner) Course::factory()->create(['code' => $code]);
        $shared = Course::factory()->create(['code' => 'M1480']);
        $unknown = Course::factory()->create(['code' => 'CUSTOM-COURSE']);
        $before = [GradeEntry::count(), AttendanceRecord::count(), StudentClinicalAssignment::count()];
        $migration = require database_path('migrations/2026_09_28_100000_create_course_department_table.php');
        // In-memory test DB only: simulate the first production migration.
        $migration->down();
        $migration->up();
        foreach ($examples as $code => $owner) {
            $this->assertDatabaseHas('course_department', ['course_id' => Course::where('code', $code)->value('id'), 'department_id' => Department::where('code', $owner)->value('id')]);
        }
        $this->assertDatabaseMissing('course_department', ['course_id' => $shared->id]);
        $this->assertDatabaseMissing('course_department', ['course_id' => $unknown->id]);
        $this->assertSame($before, [GradeEntry::count(), AttendanceRecord::count(), StudentClinicalAssignment::count()]);
    }

    public function test_csv_downloads_use_the_same_course_and_student_boundaries(): void
    {
        $students = $this->get('/api/v1/export/students')->assertOk()->streamedContent();
        $this->assertStringContainsString($this->student->university_number, $students);
        $this->assertStringNotContainsString($this->other->university_number, $students);
        foreach (['attendance', 'grades', 'assessments'] as $module) {
            $csv = $this->get('/api/v1/export/'.$module)->assertOk()->streamedContent();
            $lines = preg_split('/\r?\n/', trim($csv));
            $this->assertCount(2, $lines, $module.' header and exactly one owned record');
        }
    }

    public function test_registration_groups_counts_and_members_do_not_leak_other_students(): void
    {
        $cycle = \App\Models\GroupRegistrationCycle::create(['academic_year_id' => $this->year->id, 'academic_level' => 'fifth', 'public_id' => (string) \Illuminate\Support\Str::uuid(), 'status' => 'open', 'default_capacity' => 20, 'main_group_codes' => ['A', 'B', 'C']]);
        foreach ([$this->student, $this->other] as $student) {
            \App\Models\StudentGroupRoster::create(['group_registration_cycle_id' => $cycle->id, 'student_id' => $student->id, 'student_group_id' => $this->subgroup->student_group_id]);
            \App\Models\StudentGroupAssignment::create(['academic_year_id' => $this->year->id, 'student_id' => $student->id, 'student_group_id' => $this->subgroup->student_group_id, 'student_subgroup_id' => $this->subgroup->id]);
        }
        $response = $this->getJson('/api/v1/group-registration-cycles')->assertOk()->assertJsonCount(1, 'data');
        $response->assertJsonPath('data.0.main_group_codes', ['A'])->assertJsonPath('data.0.rosters_count', 1);
        $response->assertJsonPath('data.0.groups.0.subgroups.0.current_students_count', 1);
        $response->assertJsonCount(1, 'data.0.groups.0.subgroups.0.registered_students');
        $this->putJson('/api/v1/students/'.$this->student->id, ['phone' => '0590000000', 'group_registration_cycle_id' => $cycle->id, 'main_group_code' => 'A'])->assertOk();
        $this->assertDatabaseHas('student_group_rosters', ['student_id' => $this->student->id, 'student_group_id' => $this->subgroup->student_group_id]);
        $this->putJson('/api/v1/students/'.$this->student->id, ['main_group_code' => 'B'])->assertForbidden();
        $this->putJson('/api/v1/students/'.$this->student->id, ['academic_level' => 'fourth'])->assertForbidden();
    }

    public function test_dual_role_personal_supervisor_view_is_independent_of_department_admin_scope(): void
    {
        $role = Role::where('code', 'CLINICAL_SUPERVISOR')->firstOrFail();
        $role->permissions()->syncWithoutDetaching(Permission::whereIn('code', ['supervisor.workspace.view', 'distribution.update'])->pluck('id')->mapWithKeys(fn ($id) => [$id => ['scope_type' => 'global']])->all());
        $this->head->roles()->attach($role);
        $person = \App\Models\Person::factory()->create(['user_id' => $this->head->id, 'department_id' => $this->department->id]);
        $assignments = StudentClinicalAssignment::where('student_id', $this->student->id)->get();
        foreach ($assignments as $assignment) $assignment->update(['supervisor_id' => $person->id]);
        $this->actingAs($this->head->fresh());
        $this->getJson('/api/v1/operational/my-supervisor-assignments')->assertOk()->assertJsonCount(2, 'data');
        $this->getJson('/api/v1/operational/supervisors/'.$person->id.'/assignments')->assertOk()->assertJsonCount(1, 'data');
        $outside = $assignments->first(fn ($assignment) => $assignment->rotationBlock->rotation->course_id === $this->outside->id);
        $this->putJson('/api/v1/operational/assignments/'.$outside->id.'/supervisor', ['supervisor_id' => null])->assertForbidden();
    }

    public function test_grade_sheet_notifications_are_sent_only_to_the_owning_department_head(): void
    {
        \Illuminate\Support\Facades\Notification::fake();
        $otherDepartment = Department::factory()->create();
        $this->outside->departments()->sync([$otherDepartment->id]);
        $otherHead = User::factory()->create();
        $otherHead->roles()->attach(Role::where('code', 'DEPARTMENT_HEAD')->value('id'), ['scope_type' => 'department', 'scope_id' => $otherDepartment->id]);
        $director = User::factory()->create();
        $director->roles()->attach(Role::where('code', 'CLINICAL_DIRECTOR')->value('id'));
        $workflow = \App\Models\ApprovalWorkflow::create(['code' => 'HEAD-SCOPE-TEST', 'name_ar' => 'اختبار النطاق', 'name_en' => 'Scope test', 'is_active' => true, 'prevent_requester_approval' => false]);
        $workflow->steps()->create(['step_order' => 1, 'name_ar' => 'رئيس القسم', 'name_en' => 'Department head', 'role_codes' => ['DEPARTMENT_HEAD']]);
        $request = app(\App\Services\Approvals\ApprovalWorkflowService::class)->submit('HEAD-SCOPE-TEST', 'grade_sheet', 'outside-test', $director, 'كشف القسم الآخر', 'Outside sheet', '/grades', ['course_id' => $this->outside->id]);
        $scope = app(DepartmentHeadCourseScope::class);
        $this->assertFalse($scope->approvals(\App\Models\ApprovalRequest::query(), $this->head)->whereKey($request->id)->exists());
        $this->assertTrue($scope->approvals(\App\Models\ApprovalRequest::query(), $otherHead)->whereKey($request->id)->exists());
        \Illuminate\Support\Facades\Notification::assertNotSentTo($this->head, \App\Notifications\LocalSystemNotification::class);
        \Illuminate\Support\Facades\Notification::assertSentTo($otherHead, \App\Notifications\LocalSystemNotification::class);
    }
}
