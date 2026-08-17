<?php

namespace Tests\Feature\Phase4C;

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
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DistributionWorkbenchTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $unauthorized;
    private Rotation $rotation;
    private DistributionVersion $version1;
    private DistributionVersion $version2;
    private Student $student1;
    private Student $student2;
    private RotationBlock $block1;
    private TrainingSite $site1;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([\Database\Seeders\PermissionSeeder::class, \Database\Seeders\RoleSeeder::class, \Database\Seeders\RolePermissionSeeder::class]);

        $adminRole = \App\Models\Role::create(['code' => 'TEST_ADMIN', 'name_key' => 'admin', 'name_ar' => 'Admin', 'name_en' => 'Admin']);
        $adminRole->permissions()->sync(\App\Models\Permission::whereIn('code', [
            'distribution.view',
            'distribution.create',
            'distribution.approve',
            'distribution.publish'
        ])->pluck('id')->mapWithKeys(fn($id) => [$id => ['scope_type' => 'global']])->all());

        $this->admin = User::factory()->create();
        $this->admin->roles()->attach($adminRole);

        $this->unauthorized = User::factory()->create();

        $this->rotation = Rotation::factory()->create();
        $this->block1 = RotationBlock::factory()->create(['rotation_id' => $this->rotation->id]);
        
        $group = StudentGroup::factory()->create([
            'academic_year_id' => $this->rotation->academic_year_id,
            'academic_level' => $this->rotation->academic_level
        ]);
        $subgroup = StudentSubgroup::factory()->create(['student_group_id' => $group->id, 'is_active' => true]);

        $this->student1 = Student::factory()->create(['academic_year_id' => $this->rotation->academic_year_id]);
        \App\Models\StudentGroupAssignment::factory()->create([
            'student_id' => $this->student1->id,
            'student_subgroup_id' => $subgroup->id,
            'academic_year_id' => $this->rotation->academic_year_id
        ]);

        $this->student2 = Student::factory()->create(['academic_year_id' => $this->rotation->academic_year_id]);
        \App\Models\StudentGroupAssignment::factory()->create([
            'student_id' => $this->student2->id,
            'student_subgroup_id' => $subgroup->id,
            'academic_year_id' => $this->rotation->academic_year_id
        ]);

        $this->site1 = TrainingSite::factory()->create();

        $this->rotation->siteCapacityRules()->create([
            'site_id' => $this->site1->id,
            'max_students' => 5
        ]);

        $this->version1 = DistributionVersion::create([
            'rotation_id' => $this->rotation->id,
            'status' => 'suggested'
        ]);

        $this->version2 = DistributionVersion::create([
            'rotation_id' => $this->rotation->id,
            'status' => 'published'
        ]);

        StudentClinicalAssignment::create([
            'distribution_version_id' => $this->version1->id,
            'student_id' => $this->student1->id,
            'student_subgroup_id' => $subgroup->id,
            'rotation_block_id' => $this->block1->id,
            'training_site_id' => $this->site1->id,
            'department_id' => $this->block1->department_id,
        ]);
    }

    public function test_authorized_user_can_list_distribution_versions()
    {
        $response = $this->actingAs($this->admin)->getJson(route('api.v1.distribution-versions.index'));

        $response->assertStatus(200);
        $response->assertJsonCount(2, 'data.data');

        // Check is_current_published flag on published version
        $data = $response->json('data.data');
        $publishedItem = collect($data)->firstWhere('id', $this->version2->id);
        $this->assertTrue($publishedItem['is_current_published']);
    }

    public function test_unauthorized_user_cannot_list_versions()
    {
        $response = $this->actingAs($this->unauthorized)->getJson(route('api.v1.distribution-versions.index'));

        $response->assertStatus(403);
    }

    public function test_authorized_user_can_get_version_details_with_summary()
    {
        $response = $this->actingAs($this->admin)->getJson(route('api.v1.distribution-versions.show', $this->version1->id));

        $response->assertStatus(200);
        $response->assertJsonPath('data.id', $this->version1->id);
        $response->assertJsonPath('data.summary.total_students', 2);
        $response->assertJsonPath('data.summary.assigned_students', 1);
        $response->assertJsonPath('data.summary.unassigned_students', 1);
    }

    public function test_unassigned_students_endpoint()
    {
        $response = $this->actingAs($this->admin)->getJson(route('api.v1.distribution-versions.unassigned', $this->version1->id));

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'data');
        $this->assertEquals($this->student2->id, $response->json('data.0.id'));
    }

    public function test_audit_logs_endpoint()
    {
        AuditLog::create([
            'user_id' => $this->admin->id,
            'action' => 'assignment.created',
            'entity_type' => StudentClinicalAssignment::class,
            'entity_id' => 1,
            'distribution_version_id' => $this->version1->id,
            'student_id' => $this->student1->id,
            'changes' => null,
            'is_override' => false,
            'override_reason' => null
        ]);

        $response = $this->actingAs($this->admin)->getJson(route('api.v1.distribution-versions.audit-logs', $this->version1->id));

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'data.data');
        $this->assertEquals('assignment.created', $response->json('data.data.0.action'));
    }

    public function test_conflicts_endpoint()
    {
        $response = $this->actingAs($this->admin)->getJson(route('api.v1.distribution-versions.conflicts', $this->version1->id));

        $response->assertStatus(200);
        $response->assertJsonIsArray('data');
    }
}
