<?php

namespace Tests\Feature\Phase4B;

use App\Models\AuditLog;
use App\Models\DistributionVersion;
use App\Models\Rotation;
use App\Models\RotationBlock;
use App\Models\Student;
use App\Models\StudentClinicalAssignment;
use App\Models\StudentGroup;
use App\Models\StudentSubgroup;
use App\Models\TrainingSite;
use App\Models\User;
use App\Models\ApprovalRequest;
use App\Models\CourseScheduleCell;
use App\Models\CourseScheduleRow;
use App\Models\Permission;
use App\Models\Role;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DistributionApprovalTest extends TestCase
{
    use RefreshDatabase;

    private User $approveAdmin;
    private User $unauthorized;
    private User $overrideAdmin;
    private DistributionVersion $version;
    private Student $student1;
    private RotationBlock $block1;
    private TrainingSite $site1;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([\Database\Seeders\PermissionSeeder::class, \Database\Seeders\RoleSeeder::class, \Database\Seeders\RolePermissionSeeder::class]);

        $approveRole = \App\Models\Role::create(['code' => 'TEST_APPROVE', 'name_key' => 'approve', 'name_ar' => 'Approve', 'name_en' => 'Approve']);
        $approveRole->permissions()->sync(\App\Models\Permission::whereIn('code', [
            'distribution.approve'
        ])->pluck('id')->mapWithKeys(fn($id) => [$id => ['scope_type' => 'global']])->all());

        $this->approveAdmin = User::factory()->create();
        $this->approveAdmin->roles()->sync($approveRole);

        $overrideRole = \App\Models\Role::create(['code' => 'TEST_OVERRIDE', 'name_key' => 'override', 'name_ar' => 'Override', 'name_en' => 'Override']);
        $overrideRole->permissions()->attach(\App\Models\Permission::whereIn('code', [
            'distribution.approve',
            'distribution.override'
        ])->pluck('id')->mapWithKeys(fn($id) => [$id => ['scope_type' => 'global']])->all());

        $this->overrideAdmin = User::factory()->create();
        $this->overrideAdmin->roles()->attach($overrideRole);

        \App\Models\ApprovalWorkflow::where('code', 'clinical_distribution')->firstOrFail()
            ->steps()->firstOrFail()->update(['role_codes' => ['TEST_APPROVE', 'TEST_OVERRIDE']]);
        \App\Models\ApprovalWorkflow::where('code', 'clinical_distribution')->firstOrFail()
            ->steps()->where('step_order', '>', 1)->delete();

        $this->unauthorized = User::factory()->create();

        $rotation = Rotation::factory()->create();
        $this->block1 = RotationBlock::factory()->create(['rotation_id' => $rotation->id]);
        
        $group = StudentGroup::factory()->create([
            'academic_year_id' => $rotation->academic_year_id,
            'academic_level' => $rotation->academic_level
        ]);
        $subgroup = StudentSubgroup::factory()->create(['student_group_id' => $group->id, 'is_active' => true]);

        $this->student1 = Student::factory()->create(['academic_year_id' => $rotation->academic_year_id]);
        \App\Models\StudentGroupAssignment::factory()->create([
            'student_id' => $this->student1->id,
            'student_subgroup_id' => $subgroup->id,
            'academic_year_id' => $rotation->academic_year_id
        ]);

        $this->site1 = TrainingSite::factory()->create();

        $rotation->siteCapacityRules()->create([
            'site_id' => $this->site1->id,
            'max_students' => 5
        ]);

        $this->version = DistributionVersion::create([
            'rotation_id' => $rotation->id,
            'status' => 'suggested'
        ]);

        $scheduleRow = CourseScheduleRow::create([
            'distribution_version_id' => $this->version->id,
            'row_type' => 'vacancy',
            'training_site_id' => $this->site1->id,
            'label' => 'Test schedule row',
        ]);
        CourseScheduleCell::create([
            'distribution_version_id' => $this->version->id,
            'course_schedule_row_id' => $scheduleRow->id,
            'rotation_block_id' => $this->block1->id,
            'student_subgroup_id' => $subgroup->id,
        ]);

        StudentClinicalAssignment::create([
            'distribution_version_id' => $this->version->id,
            'student_id' => $this->student1->id,
            'student_subgroup_id' => $subgroup->id,
            'rotation_block_id' => $this->block1->id,
            'training_site_id' => $this->site1->id,
            'department_id' => $this->block1->department_id,
        ]);
    }

    public function test_authorized_user_can_approve()
    {
        $response = $this->actingAs($this->approveAdmin)->postJson(
            route('api.v1.distribution-versions.approve', $this->version->id)
        );

        $response->assertStatus(200);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'version.approved',
            'distribution_version_id' => $this->version->id,
            'user_id' => $this->approveAdmin->id
        ]);

        $audit = AuditLog::where('action', 'version.approved')->first();
        $this->assertNotNull($audit->changes['fingerprint']);
    }

    public function test_preparer_submission_persists_and_appears_in_the_current_approvers_inbox(): void
    {
        $submitterRole = Role::create(['code' => 'TEST_DISTRIBUTION_PREPARER', 'name_key' => 'distribution.preparer']);
        $submitterRole->permissions()->sync(
            Permission::where('code', 'distribution.approve')->pluck('id')->mapWithKeys(fn ($id) => [$id => ['scope_type' => 'global']])->all()
        );
        $submitter = User::factory()->create();
        $submitter->roles()->attach($submitterRole);

        $this->actingAs($submitter)->postJson(route('api.v1.distribution-versions.approve', $this->version->id))
            ->assertOk()
            ->assertJsonPath('data.approval_status', 'pending');

        $this->assertDatabaseCount('approval_requests', 1);
        $this->assertSame('pending', ApprovalRequest::firstOrFail()->status);
        $this->assertStringContainsString('academic_year_id='.$this->version->rotation->academic_year_id, ApprovalRequest::firstOrFail()->source_url);
        $this->assertStringContainsString('academic_level='.$this->version->rotation->academic_level, ApprovalRequest::firstOrFail()->source_url);
        $this->assertDatabaseMissing('audit_logs', [
            'action' => 'version.approved',
            'distribution_version_id' => $this->version->id,
        ]);

        $approverRole = $this->approveAdmin->roles()->firstOrFail();
        $approverRole->permissions()->syncWithoutDetaching(
            Permission::where('code', 'approvals.view')->pluck('id')->mapWithKeys(fn ($id) => [$id => ['scope_type' => 'global']])->all()
        );
        $this->actingAs($this->approveAdmin)->getJson('/api/v1/approvals')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.subject_id', (string) $this->version->id);

        $this->actingAs($this->approveAdmin)->postJson(route('api.v1.distribution-versions.approve', $this->version->id))
            ->assertOk()
            ->assertJsonPath('data.approval_status', 'approved');
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'version.approved',
            'distribution_version_id' => $this->version->id,
        ]);
    }

    public function test_unauthorized_user_cannot_approve()
    {
        $response = $this->actingAs($this->unauthorized)->postJson(
            route('api.v1.distribution-versions.approve', $this->version->id)
        );

        $response->assertStatus(403);
    }

    public function test_published_version_cannot_be_approved()
    {
        $this->version->update(['status' => 'published']);

        $response = $this->actingAs($this->approveAdmin)->postJson(
            route('api.v1.distribution-versions.approve', $this->version->id)
        );

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('version');
    }

    public function test_unassigned_students_block_approval()
    {
        // Add an active student who is not assigned
        $student2 = Student::factory()->create(['academic_year_id' => $this->version->rotation->academic_year_id]);
        \App\Models\StudentGroupAssignment::factory()->create([
            'student_id' => $student2->id,
            'student_subgroup_id' => \App\Models\StudentSubgroup::first()->id,
            'academic_year_id' => $this->version->rotation->academic_year_id
        ]);

        $response = $this->actingAs($this->approveAdmin)->postJson(
            route('api.v1.distribution-versions.approve', $this->version->id)
        );

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('unassigned');
    }

    public function test_override_allows_approval_when_authorized()
    {
        $student2 = Student::factory()->create(['academic_year_id' => $this->version->rotation->academic_year_id]);
        \App\Models\StudentGroupAssignment::factory()->create([
            'student_id' => $student2->id,
            'student_subgroup_id' => \App\Models\StudentSubgroup::first()->id,
            'academic_year_id' => $this->version->rotation->academic_year_id
        ]);

        $response = $this->actingAs($this->overrideAdmin)->postJson(
            route('api.v1.distribution-versions.approve', $this->version->id),
            [
                'force' => true,
                'override_reason' => 'Approved despite unassigned students'
            ]
        );

        $response->assertStatus(200);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'version.approved',
            'is_override' => true
        ]);
    }

    public function test_override_without_reason_fails()
    {
        $student2 = Student::factory()->create(['academic_year_id' => $this->version->rotation->academic_year_id]);
        \App\Models\StudentGroupAssignment::factory()->create([
            'student_id' => $student2->id,
            'student_subgroup_id' => \App\Models\StudentSubgroup::first()->id,
            'academic_year_id' => $this->version->rotation->academic_year_id
        ]);

        $response = $this->actingAs($this->overrideAdmin)->postJson(
            route('api.v1.distribution-versions.approve', $this->version->id),
            [
                'force' => true
            ]
        );

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('override_reason');
    }
}
