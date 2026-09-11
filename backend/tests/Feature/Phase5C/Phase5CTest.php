<?php

namespace Tests\Feature\Phase5C;

use App\Models\AuditLog;
use App\Models\Department;
use App\Models\Course;
use App\Models\ClinicalAssessmentTemplate;
use App\Models\DistributionVersion;
use App\Models\Permission;
use App\Models\Person;
use App\Models\Role;
use App\Models\Rotation;
use App\Models\RotationBlock;
use App\Models\Student;
use App\Models\StudentClinicalAssignment;
use App\Models\StudentGroup;
use App\Models\StudentSubgroup;
use App\Models\SupervisorAvailability;
use App\Models\TrainingSite;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class Phase5CTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $unauthorized;
    private Rotation $rotation;
    private Course $course;
    private RotationBlock $block1;
    private Department $department1;
    private TrainingSite $site1;
    private Person $supervisor1;
    private Person $supervisor2;
    private Student $student1;
    private Student $student2;
    private StudentSubgroup $subgroup;
    private DistributionVersion $publishedVersion;
    private StudentClinicalAssignment $assignment1;
    private StudentClinicalAssignment $assignment2;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([
            \Database\Seeders\PermissionSeeder::class,
            \Database\Seeders\RoleSeeder::class,
            \Database\Seeders\RolePermissionSeeder::class,
        ]);

        $adminRole = Role::create([
            'code'     => 'TEST_ADMIN_5C',
            'name_key' => 'admin',
            'name_ar'  => 'Admin',
            'name_en'  => 'Admin',
        ]);
        $adminRole->permissions()->attach(Permission::whereIn('code', [
            'distribution.view',
            'distribution.create',
            'distribution.update',
            'distribution.approve',
            'distribution.publish',
            'distribution.override',
        ])->pluck('id'), ['scope_type' => 'global']);

        $this->admin = User::factory()->create();
        $this->admin->roles()->attach($adminRole);

        $this->unauthorized = User::factory()->create();

        $this->department1 = Department::factory()->create([
            'name_en' => 'Surgery',
            'name_ar' => 'الجراحة',
        ]);

        $this->course = Course::factory()->create();

        $this->rotation = Rotation::factory()->create([
            'course_id'      => $this->course->id,
            'name'           => 'Surgery Rotation',
            'start_date'     => '2026-09-01',
            'end_date'       => '2026-10-30',
            'duration_weeks' => 8,
        ]);

        $this->block1 = RotationBlock::factory()->create([
            'rotation_id'   => $this->rotation->id,
            'block_code'    => 'SURG_1',
            'from_week'     => 1,
            'to_week'       => 4,
            'department_id' => $this->department1->id,
        ]);

        $group = StudentGroup::factory()->create([
            'academic_year_id' => $this->rotation->academic_year_id,
            'academic_level'   => $this->rotation->academic_level,
        ]);
        $this->subgroup = StudentSubgroup::factory()->create([
            'student_group_id' => $group->id,
            'is_active'        => true,
        ]);

        $this->student1 = Student::factory()->create([
            'full_name_ar'      => 'أحمد علي',
            'full_name_en'      => 'Ahmad Ali',
            'university_number' => '20260001',
            'academic_year_id'  => $this->rotation->academic_year_id,
            'registration_status' => 'active',
        ]);

        $this->student2 = Student::factory()->create([
            'full_name_ar'      => 'بلال زيد',
            'full_name_en'      => 'Bilal Zaid',
            'university_number' => '20260002',
            'academic_year_id'  => $this->rotation->academic_year_id,
            'registration_status' => 'active',
        ]);

        $this->site1 = TrainingSite::factory()->create([
            'name_en' => 'Al-Ahli Hospital',
            'name_ar' => 'مستشفى الأهلي',
        ]);

        $this->supervisor1 = Person::factory()->create([
            'full_name_ar'   => 'د. عمر كحلوت',
            'full_name_en'   => 'Dr. Omar Kahlout',
            'department_id'  => $this->department1->id,
            'primary_site_id' => $this->site1->id,
            'is_active'      => true,
            'max_students'   => 10,
        ]);

        $this->supervisor2 = Person::factory()->create([
            'full_name_ar'   => 'د. سامي حسن',
            'full_name_en'   => 'Dr. Sami Hassan',
            'department_id'  => $this->department1->id,
            'primary_site_id' => $this->site1->id,
            'is_active'      => true,
            'max_students'   => 1,
        ]);

        SupervisorAvailability::create([
            'person_id' => $this->supervisor1->id,
            'training_site_id' => $this->site1->id,
            'department_id' => $this->department1->id,
            'day' => 'thursday',
            'available_from' => '2026-09-01',
            'available_until' => '2026-10-30',
            'status' => 'work',
        ]);

        $this->publishedVersion = DistributionVersion::create([
            'rotation_id' => $this->rotation->id,
            'status'      => 'published',
            'is_current'  => true,
        ]);

        $this->assignment1 = StudentClinicalAssignment::create([
            'distribution_version_id' => $this->publishedVersion->id,
            'student_id'              => $this->student1->id,
            'student_subgroup_id'     => $this->subgroup->id,
            'rotation_block_id'       => $this->block1->id,
            'training_site_id'        => $this->site1->id,
            'department_id'           => $this->department1->id,
            'supervisor_id'           => $this->supervisor1->id,
        ]);

        $this->assignment2 = StudentClinicalAssignment::create([
            'distribution_version_id' => $this->publishedVersion->id,
            'student_id'              => $this->student2->id,
            'student_subgroup_id'     => $this->subgroup->id,
            'rotation_block_id'       => $this->block1->id,
            'training_site_id'        => $this->site1->id,
            'department_id'           => $this->department1->id,
            'supervisor_id'           => null,
        ]);
    }

    // =========================================================================
    // 1. RBAC & Security
    // =========================================================================

    public function test_unauthenticated_user_cannot_reassign_supervisor(): void
    {
        $this->putJson(
            route('api.v1.operational.assignments.supervisor.reassign', $this->assignment1->id),
            ['supervisor_id' => $this->supervisor2->id]
        )->assertStatus(401);
    }

    public function test_unauthorized_user_cannot_reassign_supervisor(): void
    {
        $this->actingAs($this->unauthorized)
            ->putJson(
                route('api.v1.operational.assignments.supervisor.reassign', $this->assignment1->id),
                ['supervisor_id' => $this->supervisor2->id]
            )->assertStatus(403);
    }

    // =========================================================================
    // 2. Supervisor Reassignment — Happy Path
    // =========================================================================

    public function test_authorized_user_can_reassign_supervisor(): void
    {
        $response = $this->actingAs($this->admin)
            ->putJson(
                route('api.v1.operational.assignments.supervisor.reassign', $this->assignment1->id),
                ['supervisor_id' => $this->supervisor2->id]
            );

        $response->assertStatus(200);
        $response->assertJsonPath('success', true);
        $response->assertJsonPath('data.supervisor_id', $this->supervisor2->id);

        $this->assertDatabaseHas('student_clinical_assignments', [
            'id'            => $this->assignment1->id,
            'supervisor_id' => $this->supervisor2->id,
        ]);
    }

    public function test_supervisor_reassignment_generates_audit_log(): void
    {
        $this->actingAs($this->admin)
            ->putJson(
                route('api.v1.operational.assignments.supervisor.reassign', $this->assignment1->id),
                ['supervisor_id' => $this->supervisor2->id]
            )->assertStatus(200);

        $log = AuditLog::where('action', 'supervisor.reassigned')
            ->where('entity_id', $this->assignment1->id)
            ->first();

        $this->assertNotNull($log);
        $this->assertEquals($this->admin->id, $log->user_id);
        $this->assertEquals($this->supervisor1->id, $log->changes['old_supervisor_id']);
        $this->assertEquals($this->supervisor2->id, $log->changes['new_supervisor_id']);
    }

    public function test_authorized_user_can_unassign_supervisor_with_null(): void
    {
        $response = $this->actingAs($this->admin)
            ->putJson(
                route('api.v1.operational.assignments.supervisor.reassign', $this->assignment1->id),
                ['supervisor_id' => null]
            );

        $response->assertStatus(200);
        $response->assertJsonPath('data.supervisor_id', null);

        $this->assertDatabaseHas('student_clinical_assignments', [
            'id'            => $this->assignment1->id,
            'supervisor_id' => null,
        ]);
    }

    // =========================================================================
    // 3. Supervisor Reassignment — Validation Guards
    // =========================================================================

    public function test_inactive_supervisor_cannot_be_assigned(): void
    {
        $inactiveSupervisor = Person::factory()->create([
            'is_active'      => false,
            'department_id'  => $this->department1->id,
            'primary_site_id' => $this->site1->id,
        ]);

        $response = $this->actingAs($this->admin)
            ->putJson(
                route('api.v1.operational.assignments.supervisor.reassign', $this->assignment1->id),
                ['supervisor_id' => $inactiveSupervisor->id]
            );

        $response->assertStatus(422);
        $response->assertJsonPath('success', false);
        $this->assertArrayHasKey('supervisor_id', $response->json('errors'));
    }

    public function test_non_existent_supervisor_id_rejected(): void
    {
        $response = $this->actingAs($this->admin)
            ->putJson(
                route('api.v1.operational.assignments.supervisor.reassign', $this->assignment1->id),
                ['supervisor_id' => 99999]
            );

        $response->assertStatus(422);
        $this->assertArrayHasKey('supervisor_id', $response->json('errors'));
    }

    public function test_reassignment_on_unpublished_version_is_rejected(): void
    {
        $draftVersion = DistributionVersion::create([
            'rotation_id' => $this->rotation->id,
            'status'      => 'manual',
            'is_current'  => false,
        ]);

        $draftAssignment = StudentClinicalAssignment::create([
            'distribution_version_id' => $draftVersion->id,
            'student_id'              => $this->student1->id,
            'rotation_block_id'       => $this->block1->id,
            'training_site_id'        => $this->site1->id,
            'department_id'           => $this->department1->id,
            'supervisor_id'           => null,
        ]);

        $response = $this->actingAs($this->admin)
            ->putJson(
                route('api.v1.operational.assignments.supervisor.reassign', $draftAssignment->id),
                ['supervisor_id' => $this->supervisor1->id]
            );

        $response->assertStatus(422);
        $this->assertArrayHasKey('version', $response->json('errors'));
    }

    public function test_supervisor_workload_warning_is_returned_when_capacity_is_exceeded(): void
    {
        // supervisor2 has max_students = 1. Assign them to assignment2 first.
        $this->actingAs($this->admin)
            ->putJson(
                route('api.v1.operational.assignments.supervisor.reassign', $this->assignment2->id),
                ['supervisor_id' => $this->supervisor2->id]
            )->assertStatus(200);

        // Now assign supervisor2 to assignment1 as well — should succeed with warning
        $response = $this->actingAs($this->admin)
            ->putJson(
                route('api.v1.operational.assignments.supervisor.reassign', $this->assignment1->id),
                ['supervisor_id' => $this->supervisor2->id]
            );

        $response->assertStatus(200);
        $response->assertJsonPath('success', true);
        $this->assertArrayHasKey('warning', $response->json());
    }

    // =========================================================================
    // 4. Supervisor Portal View — my-supervisor-assignments
    // =========================================================================

    public function test_supervisor_portal_returns_empty_when_no_person_record(): void
    {
        $response = $this->actingAs($this->admin)
            ->getJson(route('api.v1.operational.my-supervisor-assignments'));

        $response->assertStatus(200);
        $response->assertJsonPath('success', true);
        // Admin user has no linked Person record
        $response->assertJsonPath('meta.is_supervisor', false);
        $response->assertJsonPath('meta.total', 0);
    }

    public function test_supervisor_portal_returns_assignments_for_linked_person(): void
    {
        // Link supervisor1 Person to admin user
        $this->supervisor1->update(['user_id' => $this->admin->id]);

        $response = $this->actingAs($this->admin)
            ->getJson(route('api.v1.operational.my-supervisor-assignments'));

        $response->assertStatus(200);
        $response->assertJsonPath('success', true);
        $response->assertJsonPath('meta.is_supervisor', true);
        $response->assertJsonPath('meta.person_id', $this->supervisor1->id);
        $response->assertJsonCount(1, 'data'); // Only assignment1 has supervisor1
    }

    // =========================================================================
    // 5. Admin Supervisor Assignments View
    // =========================================================================

    public function test_admin_can_view_any_supervisors_assignments(): void
    {
        $response = $this->actingAs($this->admin)
            ->getJson(route('api.v1.operational.supervisors.assignments', $this->supervisor1->id));

        $response->assertStatus(200);
        $response->assertJsonPath('success', true);
        $response->assertJsonPath('meta.person_id', $this->supervisor1->id);
        $response->assertJsonCount(1, 'data');
    }

    public function test_unauthorized_user_cannot_view_supervisor_assignments(): void
    {
        $this->actingAs($this->unauthorized)
            ->getJson(route('api.v1.operational.supervisors.assignments', $this->supervisor1->id))
            ->assertStatus(403);
    }

    public function test_multi_role_department_leader_can_open_personal_workspace_only_when_supervisor_role_is_assigned(): void
    {
        $this->supervisor1->update(['user_id' => $this->admin->id]);

        $this->actingAs($this->admin)
            ->getJson(route('api.v1.operational.my-supervisor-workspace'))
            ->assertStatus(403);

        $this->admin->roles()->attach(Role::where('code', 'CLINICAL_SUPERVISOR')->firstOrFail());

        $this->actingAs($this->admin)
            ->getJson(route('api.v1.operational.my-supervisor-workspace'))
            ->assertOk()
            ->assertJsonPath('data.supervisor.person_id', $this->supervisor1->id)
            ->assertJsonCount(1, 'data.assignments');
    }

    public function test_supervisor_sessions_stay_hidden_until_work_places_and_days_are_configured(): void
    {
        $this->supervisor1->update(['user_id' => $this->admin->id]);
        $this->supervisor1->availabilities()->delete();
        $this->admin->roles()->attach(Role::where('code', 'CLINICAL_SUPERVISOR')->firstOrFail());

        $this->actingAs($this->admin)
            ->getJson(route('api.v1.operational.my-supervisor-workspace'))
            ->assertOk()
            ->assertJsonCount(1, 'data.assignments')
            ->assertJsonCount(0, 'data.assignments.0.scheduled_dates')
            ->assertJsonPath('data.schedule_configured', false);
    }

    public function test_supervisor_workspace_does_not_require_administrative_distribution_access(): void
    {
        $supervisorUser = User::factory()->create();
        $supervisorRole = Role::where('code', 'CLINICAL_SUPERVISOR')->firstOrFail();
        $supervisorUser->roles()->attach($supervisorRole);
        $this->supervisor1->update(['user_id' => $supervisorUser->id]);

        $this->assertTrue($supervisorRole->permissions()->where('code', 'supervisor.workspace.view')->exists());
        $this->assertFalse($supervisorRole->permissions()->where('code', 'distribution.view')->exists());

        $this->actingAs($supervisorUser)
            ->getJson(route('api.v1.operational.my-supervisor-workspace'))
            ->assertOk()
            ->assertJsonPath('data.supervisor.person_id', $this->supervisor1->id)
            ->assertJsonPath('data.assignments.0.session_start_date', '2026-09-01')
            ->assertJsonPath('data.assignments.0.session_end_date', '2026-09-28')
            ->assertJsonCount(1, 'data.assignments');
    }

    public function test_supervisor_attendance_and_assessment_are_saved_in_official_tables(): void
    {
        $this->supervisor1->update(['user_id' => $this->admin->id]);
        $supervisorRole = Role::where('code', 'CLINICAL_SUPERVISOR')->firstOrFail();
        $supervisorRole->permissions()->syncWithoutDetaching(
            Permission::whereIn('code', ['attendance.record', 'assessment.create', 'grades.view'])->pluck('id')->mapWithKeys(fn ($id) => [$id => ['scope_type' => 'global']])->all()
        );
        $this->admin->roles()->attach($supervisorRole);
        $template = ClinicalAssessmentTemplate::where('is_active', true)->firstOrFail();

        $this->actingAs($this->admin)->postJson(route('api.v1.operational.my-supervisor-attendance'), [
            'assignment_id' => $this->assignment1->id,
            'session_date' => '2026-09-10',
            'records' => [['student_id' => $this->student2->id, 'status' => 'present']],
        ])->assertForbidden();

        $this->actingAs($this->admin)->postJson(route('api.v1.operational.my-supervisor-assessments'), [
            'assignment_id' => $this->assignment1->id,
            'student_id' => $this->student2->id,
            'evaluation_week' => 1,
            'template_id' => $template->id,
            'score' => 9,
        ])->assertForbidden();

        $this->actingAs($this->admin)->postJson(route('api.v1.operational.my-supervisor-attendance'), [
            'assignment_id' => $this->assignment1->id,
            'session_date' => '2026-09-10',
            'records' => [['student_id' => $this->student1->id, 'status' => 'present', 'excuse_note' => 'شارك بفاعلية في الجولة السريرية.']],
        ])->assertOk();

        $this->actingAs($this->admin)->postJson(route('api.v1.operational.my-supervisor-assessments'), [
            'assignment_id' => $this->assignment1->id,
            'student_id' => $this->student1->id,
            'evaluation_week' => 1,
            'template_id' => $template->id,
            'score' => 9.25,
            'notes' => 'Good clinical progress.',
        ])->assertOk();

        $this->assertDatabaseHas('attendance_records', ['student_id' => $this->student1->id, 'status' => 'present']);
        $this->assertDatabaseHas('attendance_records', ['student_id' => $this->student1->id, 'recorded_by_user_id' => $this->admin->id]);
        $this->assertDatabaseHas('attendance_records', ['student_id' => $this->student1->id, 'excuse_note' => 'شارك بفاعلية في الجولة السريرية.']);
        $this->assertDatabaseHas('clinical_assessments', [
            'student_id' => $this->student1->id,
            'evaluator_person_id' => $this->supervisor1->id,
            'score' => 9.25,
            'max_score' => 10,
            'notes' => 'Good clinical progress.',
            'status' => 'submitted',
        ]);

        $assessmentId = \App\Models\ClinicalAssessment::where('student_id', $this->student1->id)->value('id');
        $this->actingAs($this->admin)
            ->getJson('/api/v1/grade-entries/clinical-assessment-summary?course_id='.$this->course->id.'&academic_year_id='.$this->rotation->academic_year_id)
            ->assertOk()
            ->assertJsonPath("data.{$this->student1->id}.clinical_score", 18.5);

        $this->actingAs($this->admin)->postJson(route('api.v1.operational.my-supervisor-assessments'), [
            'assessment_id' => $assessmentId,
            'assignment_id' => $this->assignment1->id,
            'student_id' => $this->student1->id,
            'session_date' => '2026-09-10',
            'score' => 20,
        ])->assertUnprocessable();
    }

    public function test_supervisor_private_student_notes_are_saved_and_hidden_from_other_supervisors(): void
    {
        $this->supervisor1->update(['user_id' => $this->admin->id]);
        $supervisorRole = Role::where('code', 'CLINICAL_SUPERVISOR')->firstOrFail();
        $supervisorRole->permissions()->syncWithoutDetaching(
            Permission::where('code', 'supervisor.workspace.view')->pluck('id')->mapWithKeys(fn ($id) => [$id => ['scope_type' => 'global']])->all()
        );
        $this->admin->roles()->attach($supervisorRole);

        $response = $this->actingAs($this->admin)->postJson(route('api.v1.operational.my-supervisor-student-notes.store'), [
            'assignment_id' => $this->assignment1->id,
            'student_id' => $this->student1->id,
            'note_date' => '2026-09-10',
            'note' => 'يحتاج إلى تحسين أخذ التاريخ المرضي.',
        ])->assertCreated()->assertJsonPath('data.student_id', $this->student1->id);

        $noteId = $response->json('data.id');
        $this->assertDatabaseHas('supervisor_student_notes', [
            'id' => $noteId,
            'supervisor_person_id' => $this->supervisor1->id,
            'student_id' => $this->student1->id,
            'note' => 'يحتاج إلى تحسين أخذ التاريخ المرضي.',
        ]);
        $this->actingAs($this->admin)->getJson(route('api.v1.operational.my-supervisor-workspace'))
            ->assertOk()->assertJsonPath('data.student_notes.0.id', $noteId);

        $otherUser = User::factory()->create();
        $otherUser->roles()->attach($supervisorRole);
        $this->supervisor2->update(['user_id' => $otherUser->id]);
        $this->actingAs($otherUser)->putJson(route('api.v1.operational.my-supervisor-student-notes.update', $noteId), [
            'note_date' => '2026-09-11',
            'note' => 'محاولة تعديل غير مصرح بها.',
        ])->assertNotFound();
        $this->actingAs($otherUser)->deleteJson(route('api.v1.operational.my-supervisor-student-notes.destroy', $noteId))
            ->assertNotFound();
    }

    public function test_supervisor_cannot_record_outside_the_assigned_rotation_block(): void
    {
        $this->supervisor1->update(['user_id' => $this->admin->id]);
        $supervisorRole = Role::where('code', 'CLINICAL_SUPERVISOR')->firstOrFail();
        $supervisorRole->permissions()->syncWithoutDetaching(
            Permission::whereIn('code', ['attendance.record'])->pluck('id')->mapWithKeys(fn ($id) => [$id => ['scope_type' => 'global']])->all()
        );
        $this->admin->roles()->attach($supervisorRole);

        $this->actingAs($this->admin)->postJson(route('api.v1.operational.my-supervisor-attendance'), [
            'assignment_id' => $this->assignment1->id,
            'session_date' => '2026-11-15',
            'records' => [['student_id' => $this->student1->id, 'status' => 'present']],
        ])->assertUnprocessable()->assertJsonValidationErrors('session_date');

        $this->assertDatabaseCount('clinical_sessions', 0);
        $this->assertDatabaseCount('attendance_records', 0);
    }

    public function test_supervisor_batch_is_immediately_available_without_separate_approval(): void
    {
        $this->supervisor1->update(['user_id' => $this->admin->id]);
        $this->assignment2->update(['supervisor_id' => $this->supervisor1->id]);
        $supervisorRole = Role::where('code', 'CLINICAL_SUPERVISOR')->firstOrFail();
        $supervisorRole->permissions()->syncWithoutDetaching(
            Permission::whereIn('code', ['assessment.create', 'grades.view'])->pluck('id')->mapWithKeys(fn ($id) => [$id => ['scope_type' => 'global']])->all()
        );
        $this->admin->roles()->attach($supervisorRole);
        $template = ClinicalAssessmentTemplate::where('is_active', true)->firstOrFail();

        $this->actingAs($this->admin)->postJson(route('api.v1.operational.my-supervisor-assessment-batches'), [
            'assignment_id' => $this->assignment1->id,
            'evaluation_week' => 1,
            'template_id' => $template->id,
            'assessments' => [['student_id' => $this->student1->id, 'score' => 11]],
        ])->assertUnprocessable()->assertJsonValidationErrors('assessments.0.score');

        $response = $this->actingAs($this->admin)->postJson(route('api.v1.operational.my-supervisor-assessment-batches'), [
            'assignment_id' => $this->assignment1->id,
            'evaluation_week' => 1,
            'template_id' => $template->id,
            'assessments' => [
                ['student_id' => $this->student1->id, 'score' => 8.5, 'notes' => 'Good'],
                ['student_id' => $this->student2->id, 'score' => 9, 'notes' => 'Very good'],
            ],
        ])->assertOk()->assertJsonCount(2, 'data.assessments');

        $batchUuid = $response->json('data.batch_uuid');
        $this->assertDatabaseCount('clinical_assessments', 2);
        $this->assertSame(2, \App\Models\ClinicalAssessment::where('assessment_batch_uuid', $batchUuid)->where('status', 'submitted')->count());

        $this->assertDatabaseCount('approval_requests', 0);
        $this->actingAs($this->admin)
            ->getJson('/api/v1/grade-entries/clinical-assessment-summary?course_id='.$this->course->id.'&academic_year_id='.$this->rotation->academic_year_id)
            ->assertOk()
            ->assertJsonPath("data.{$this->student1->id}.clinical_score", 17)
            ->assertJsonPath("data.{$this->student2->id}.clinical_score", 18);

        $newStudent = Student::factory()->create([
            'academic_year_id' => $this->rotation->academic_year_id,
            'batch_year' => $this->student1->batch_year,
            'registration_status' => 'active',
        ]);
        $newAssignment = StudentClinicalAssignment::create([
            'distribution_version_id' => $this->publishedVersion->id,
            'student_id' => $newStudent->id,
            'student_subgroup_id' => $this->subgroup->id,
            'rotation_block_id' => $this->block1->id,
            'training_site_id' => $this->site1->id,
            'department_id' => $this->department1->id,
            'supervisor_id' => $this->supervisor1->id,
        ]);

        $newBatch = $this->actingAs($this->admin)->postJson(route('api.v1.operational.my-supervisor-assessment-batches'), [
            'assignment_id' => $this->assignment1->id,
            'evaluation_week' => 1,
            'template_id' => $template->id,
            'assessments' => [['student_id' => $newStudent->id, 'score' => 8, 'notes' => 'Joined later']],
        ])->assertOk()->assertJsonCount(1, 'data.assessments');

        $this->assertNotSame($batchUuid, $newBatch->json('data.batch_uuid'));
        $this->assertDatabaseHas('clinical_assessments', [
            'student_clinical_assignment_id' => $newAssignment->id,
            'status' => 'submitted',
            'score' => 8,
        ]);
        $this->assertSame(2, \App\Models\ClinicalAssessment::where('assessment_batch_uuid', $batchUuid)->where('status', 'submitted')->count());
    }

    // =========================================================================
    // 6. Performance — No N+1 queries
    // =========================================================================

    public function test_supervisor_portal_does_not_exhibit_n_plus_one(): void
    {
        $this->supervisor1->update(['user_id' => $this->admin->id]);

        DB::enableQueryLog();

        $this->actingAs($this->admin)
            ->getJson(route('api.v1.operational.my-supervisor-assignments'))
            ->assertStatus(200);

        $queryCount = count(DB::getQueryLog());
        $this->assertLessThanOrEqual(15, $queryCount);
    }

    public function test_student_schedule_exposes_complete_nested_clinical_context(): void
    {
        $this->actingAs($this->admin)
            ->getJson("/api/v1/students/{$this->student1->id}/current-clinical-schedule")
            ->assertOk()
            ->assertJsonPath('data.0.training_site.id', $this->site1->id)
            ->assertJsonPath('data.0.supervisor.id', $this->supervisor1->id)
            ->assertJsonPath('data.0.course.id', $this->course->id)
            ->assertJsonPath('data.0.subgroup.id', $this->subgroup->id)
            ->assertJsonPath('data.0.distribution_version_id', $this->publishedVersion->id)
            ->assertJsonPath('data.0.academic_year.id', $this->rotation->academic_year_id);
    }
}
