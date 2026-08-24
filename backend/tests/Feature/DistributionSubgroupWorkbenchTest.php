<?php

namespace Tests\Feature;

use App\Models\DistributionVersion;
use App\Models\Permission;
use App\Models\Role;
use App\Models\Rotation;
use App\Models\RotationBlock;
use App\Models\Student;
use App\Models\StudentClinicalAssignment;
use App\Models\StudentGroup;
use App\Models\StudentGroupAssignment;
use App\Models\StudentSubgroup;
use App\Models\TrainingSite;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DistributionSubgroupWorkbenchTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private DistributionVersion $version;
    private StudentSubgroup $subgroup;
    private RotationBlock $block;
    private TrainingSite $site;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([\Database\Seeders\PermissionSeeder::class]);

        $role = Role::create(['code' => 'DISTRIBUTOR_TEST', 'name_key' => 'test', 'name_ar' => 'Test', 'name_en' => 'Test']);
        $permissionIds = Permission::whereIn('code', [
            'distribution.view', 'distribution.create', 'distribution.update',
        ])->pluck('id');
        $role->permissions()->sync($permissionIds->mapWithKeys(fn ($id) => [$id => ['scope_type' => 'global']])->all());
        $this->user = User::factory()->create();
        $this->user->roles()->attach($role);

        $rotation = Rotation::factory()->create(['academic_level' => 'fourth']);
        $this->block = RotationBlock::factory()->create(['rotation_id' => $rotation->id]);
        $group = StudentGroup::factory()->create([
            'academic_year_id' => $rotation->academic_year_id,
            'academic_level' => $rotation->academic_level,
            'name' => 'L',
        ]);
        $this->subgroup = StudentSubgroup::factory()->create([
            'student_group_id' => $group->id,
            'name' => 'L1',
            'is_active' => true,
        ]);

        foreach (Student::factory()->count(2)->create([
            'academic_year_id' => $rotation->academic_year_id,
            'academic_level' => 'fourth',
            'registration_status' => 'active',
        ]) as $student) {
            StudentGroupAssignment::factory()->create([
                'student_id' => $student->id,
                'academic_year_id' => $rotation->academic_year_id,
                'student_group_id' => $group->id,
                'student_subgroup_id' => $this->subgroup->id,
                'valid_until' => null,
            ]);
        }

        $this->site = TrainingSite::factory()->create(['is_active' => true]);
        $rotation->siteCapacityRules()->create(['site_id' => $this->site->id, 'max_students' => 6]);
        $this->version = DistributionVersion::create(['rotation_id' => $rotation->id, 'status' => 'manual']);
    }

    public function test_workbench_reads_current_subgroups_from_student_groups(): void
    {
        $response = $this->actingAs($this->user)->getJson(
            route('api.v1.distribution-versions.subgroups.index', $this->version),
        );

        $response->assertOk()
            ->assertJsonPath('data.0.name', 'L1')
            ->assertJsonPath('data.0.main_group.name', 'L')
            ->assertJsonPath('data.0.student_count', 2)
            ->assertJsonPath('data.0.status', 'unassigned');
    }

    public function test_assigning_a_subgroup_creates_assignments_for_all_current_members(): void
    {
        $response = $this->actingAs($this->user)->postJson(
            route('api.v1.distribution-versions.subgroups.assignment.store', [$this->version, $this->subgroup]),
            [
                'rotation_block_id' => $this->block->id,
                'training_site_id' => $this->site->id,
            ],
        );

        $response->assertCreated()->assertJsonPath('data.student_count', 2);
        $this->assertSame(2, StudentClinicalAssignment::where([
            'distribution_version_id' => $this->version->id,
            'student_subgroup_id' => $this->subgroup->id,
        ])->count());
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'subgroup_assignment.created',
            'entity_id' => $this->subgroup->id,
        ]);
    }

    public function test_roster_change_is_reported_without_silently_rewriting_distribution(): void
    {
        $this->actingAs($this->user)->postJson(
            route('api.v1.distribution-versions.subgroups.assignment.store', [$this->version, $this->subgroup]),
            ['rotation_block_id' => $this->block->id, 'training_site_id' => $this->site->id],
        )->assertCreated();

        StudentGroupAssignment::where('student_subgroup_id', $this->subgroup->id)->firstOrFail()
            ->update(['valid_until' => now()->toDateString()]);

        $this->actingAs($this->user)->getJson(
            route('api.v1.distribution-versions.subgroups.index', $this->version),
        )->assertOk()
            ->assertJsonPath('data.0.roster_changed', true)
            ->assertJsonPath('data.0.status', 'attention');

        $this->assertSame(2, StudentClinicalAssignment::where('distribution_version_id', $this->version->id)->count());
    }

    public function test_user_without_distribution_permission_cannot_read_workbench(): void
    {
        $unauthorized = User::factory()->create();

        $this->actingAs($unauthorized)->getJson(
            route('api.v1.distribution-versions.subgroups.index', $this->version),
        )->assertForbidden();
    }

    public function test_published_version_is_immutable_for_subgroup_operations(): void
    {
        $this->version->update(['status' => 'published']);

        $this->actingAs($this->user)->postJson(
            route('api.v1.distribution-versions.subgroups.assignment.store', [$this->version, $this->subgroup]),
            ['rotation_block_id' => $this->block->id, 'training_site_id' => $this->site->id],
        )->assertUnprocessable()->assertJsonValidationErrors('version');

        $this->assertDatabaseCount('student_clinical_assignments', 0);
    }
}
