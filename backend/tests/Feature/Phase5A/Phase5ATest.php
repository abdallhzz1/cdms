<?php

namespace Tests\Feature\Phase5A;

use App\Models\AuditLog;
use App\Models\Department;
use App\Models\DistributionVersion;
use App\Models\Person;
use App\Models\Rotation;
use App\Models\RotationBlock;
use App\Models\Student;
use App\Models\StudentClinicalAssignment;
use App\Models\StudentGroup;
use App\Models\StudentSubgroup;
use App\Models\TrainingSite;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class Phase5ATest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $unauthorized;
    private Rotation $rotation;
    private RotationBlock $block1;
    private TrainingSite $site1;
    private Department $department1;
    private Person $supervisor1;
    private Student $student1;
    private Student $student2;
    private Student $inactiveStudent;
    private StudentSubgroup $subgroup;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([\Database\Seeders\PermissionSeeder::class, \Database\Seeders\RoleSeeder::class, \Database\Seeders\RolePermissionSeeder::class]);

        $adminRole = \App\Models\Role::create(['code' => 'TEST_ADMIN', 'name_key' => 'admin', 'name_ar' => 'Admin', 'name_en' => 'Admin']);
        $adminRole->permissions()->sync(\App\Models\Permission::whereIn('code', [
            'distribution.view',
            'distribution.create',
            'distribution.update',
            'distribution.approve',
            'distribution.publish',
            'distribution.override'
        ])->pluck('id')->mapWithKeys(fn($id) => [$id => ['scope_type' => 'global']])->all());

        $this->admin = User::factory()->create();
        $this->admin->roles()->attach($adminRole);

        $this->unauthorized = User::factory()->create();

        $this->department1 = Department::factory()->create();

        $this->rotation = Rotation::factory()->create();
        $this->block1 = RotationBlock::factory()->create([
            'rotation_id' => $this->rotation->id,
            'department_id' => $this->department1->id,
        ]);
        
        $group = StudentGroup::factory()->create([
            'academic_year_id' => $this->rotation->academic_year_id,
            'academic_level' => $this->rotation->academic_level
        ]);
        $this->subgroup = StudentSubgroup::factory()->create(['student_group_id' => $group->id, 'is_active' => true]);

        $this->student1 = Student::factory()->create([
            'academic_year_id' => $this->rotation->academic_year_id,
            'registration_status' => 'active'
        ]);
        \App\Models\StudentGroupAssignment::factory()->create([
            'student_id' => $this->student1->id,
            'student_subgroup_id' => $this->subgroup->id,
            'academic_year_id' => $this->rotation->academic_year_id
        ]);

        $this->student2 = Student::factory()->create([
            'academic_year_id' => $this->rotation->academic_year_id,
            'registration_status' => 'active'
        ]);
        \App\Models\StudentGroupAssignment::factory()->create([
            'student_id' => $this->student2->id,
            'student_subgroup_id' => $this->subgroup->id,
            'academic_year_id' => $this->rotation->academic_year_id
        ]);

        $this->inactiveStudent = Student::factory()->create([
            'academic_year_id' => $this->rotation->academic_year_id,
            'registration_status' => 'suspended'
        ]);
        \App\Models\StudentGroupAssignment::factory()->create([
            'student_id' => $this->inactiveStudent->id,
            'student_subgroup_id' => $this->subgroup->id,
            'academic_year_id' => $this->rotation->academic_year_id
        ]);

        $this->site1 = TrainingSite::factory()->create();

        $this->supervisor1 = Person::factory()->create([
            'department_id' => $this->department1->id,
            'primary_site_id' => $this->site1->id,
            'is_active' => true,
        ]);

        $this->rotation->siteCapacityRules()->create([
            'site_id' => $this->site1->id,
            'max_students' => 5
        ]);
    }

    private function createApprovedVersion(): DistributionVersion
    {
        $version = DistributionVersion::create([
            'rotation_id' => $this->rotation->id,
            'status' => 'suggested',
            'is_current' => false,
        ]);

        StudentClinicalAssignment::create([
            'distribution_version_id' => $version->id,
            'student_id' => $this->student1->id,
            'student_subgroup_id' => $this->subgroup->id,
            'rotation_block_id' => $this->block1->id,
            'training_site_id' => $this->site1->id,
            'department_id' => $this->block1->department_id,
            'supervisor_id' => $this->supervisor1->id,
        ]);

        $res = $this->actingAs($this->admin)->postJson(
            route('api.v1.distribution-versions.approve', $version->id),
            ['force' => true, 'override_reason' => 'Approved despite student2 unassigned']
        );
        $res->assertStatus(200);

        return $version->fresh();
    }

    public function test_no_current_published_version_returns_404()
    {
        $response = $this->actingAs($this->admin)->getJson(
            route('api.v1.rotations.current-distribution', $this->rotation->id)
        );

        $response->assertStatus(404);
    }

    public function test_publishing_version_makes_it_current()
    {
        $v1 = $this->createApprovedVersion();

        $response = $this->actingAs($this->admin)->postJson(
            route('api.v1.distribution-versions.publish', $v1->id),
            ['last_updated_at' => $v1->fresh()->updated_at->toIso8601String(), 'force' => true, 'override_reason' => 'Published with unassigned']
        );

        if ($response->status() !== 200) {
            dd($response->json());
        }

        $response->assertStatus(200);

        $v1Fresh = $v1->fresh();
        $this->assertEquals('published', $v1Fresh->status);
        $this->assertTrue($v1Fresh->is_current);

        // Verify query endpoint returns version
        $getRes = $this->actingAs($this->admin)->getJson(
            route('api.v1.rotations.current-distribution', $this->rotation->id)
        );
        $getRes->assertStatus(200);
        $this->assertEquals($v1->id, $getRes->json('data.id'));
        $this->assertTrue($getRes->json('data.is_current'));
    }

    public function test_publishing_new_version_supersedes_previous_and_removes_current_flag()
    {
        $v1 = $this->createApprovedVersion();
        $this->actingAs($this->admin)->postJson(
            route('api.v1.distribution-versions.publish', $v1->id),
            ['last_updated_at' => $v1->updated_at->toIso8601String(), 'force' => true, 'override_reason' => 'Published v1']
        );

        $v2 = $this->createApprovedVersion();
        $this->actingAs($this->admin)->postJson(
            route('api.v1.distribution-versions.publish', $v2->id),
            ['last_updated_at' => $v2->updated_at->toIso8601String(), 'force' => true, 'override_reason' => 'Published v2']
        );

        $v1Fresh = $v1->fresh();
        $v2Fresh = $v2->fresh();

        $this->assertEquals('published', $v1Fresh->status);
        $this->assertFalse($v1Fresh->is_current); // Superseded!

        $this->assertEquals('published', $v2Fresh->status);
        $this->assertTrue($v2Fresh->is_current); // New current!

        // Current endpoint returns v2
        $getRes = $this->actingAs($this->admin)->getJson(
            route('api.v1.rotations.current-distribution', $this->rotation->id)
        );
        $getRes->assertStatus(200);
        $this->assertEquals($v2->id, $getRes->json('data.id'));
    }

    public function test_publication_is_idempotent()
    {
        $v1 = $this->createApprovedVersion();
        $this->actingAs($this->admin)->postJson(
            route('api.v1.distribution-versions.publish', $v1->id),
            ['last_updated_at' => $v1->updated_at->toIso8601String(), 'force' => true, 'override_reason' => 'Published v1']
        );

        // Retry publishing v1
        $res = $this->actingAs($this->admin)->postJson(
            route('api.v1.distribution-versions.publish', $v1->id),
            ['last_updated_at' => $v1->fresh()->updated_at->toIso8601String(), 'force' => true, 'override_reason' => 'Published v1']
        );

        $res->assertStatus(200);
        $this->assertTrue($v1->fresh()->is_current);
    }

    public function test_current_distribution_summary_endpoint()
    {
        $v1 = $this->createApprovedVersion();
        $this->actingAs($this->admin)->postJson(
            route('api.v1.distribution-versions.publish', $v1->id),
            ['last_updated_at' => $v1->updated_at->toIso8601String(), 'force' => true, 'override_reason' => 'Published v1']
        );

        $res = $this->actingAs($this->admin)->getJson(
            route('api.v1.rotations.current-distribution.summary', $this->rotation->id)
        );

        $res->assertStatus(200);
        $res->assertJsonPath('data.assigned_students', 1);
        $res->assertJsonPath('data.unassigned_students', 1);
        $res->assertJsonPath('data.current_version_id', $v1->id);
    }

    public function test_student_current_clinical_schedule_returns_only_current_published()
    {
        // Unpublished version
        $vDraft = DistributionVersion::create(['rotation_id' => $this->rotation->id, 'status' => 'manual', 'is_current' => false]);
        StudentClinicalAssignment::create([
            'distribution_version_id' => $vDraft->id,
            'student_id' => $this->student1->id,
            'student_subgroup_id' => $this->subgroup->id,
            'rotation_block_id' => $this->block1->id,
            'training_site_id' => $this->site1->id,
            'department_id' => $this->block1->department_id,
        ]);

        // Current Published version
        $vPublished = $this->createApprovedVersion();
        $this->actingAs($this->admin)->postJson(
            route('api.v1.distribution-versions.publish', $vPublished->id),
            ['last_updated_at' => $vPublished->updated_at->toIso8601String(), 'force' => true, 'override_reason' => 'Published vPublished']
        );

        $res = $this->actingAs($this->admin)->getJson(
            route('api.v1.students.current-clinical-schedule', $this->student1->id)
        );

        $res->assertStatus(200);
        $res->assertJsonCount(1, 'data');
        $this->assertEquals($vPublished->id, $res->json('data.0.distribution_version_id'));
    }

    public function test_supervisor_current_clinical_schedule()
    {
        $vPublished = $this->createApprovedVersion();
        $this->actingAs($this->admin)->postJson(
            route('api.v1.distribution-versions.publish', $vPublished->id),
            ['last_updated_at' => $vPublished->updated_at->toIso8601String(), 'force' => true, 'override_reason' => 'Published vPublished']
        );

        $res = $this->actingAs($this->admin)->getJson(
            route('api.v1.supervisors.current-clinical-schedule', $this->supervisor1->id)
        );

        $res->assertStatus(200);
        $res->assertJsonCount(1, 'data');
        $this->assertEquals($this->student1->id, $res->json('data.0.student_id'));
    }

    public function test_department_current_distribution()
    {
        $vPublished = $this->createApprovedVersion();
        $this->actingAs($this->admin)->postJson(
            route('api.v1.distribution-versions.publish', $vPublished->id),
            ['last_updated_at' => $vPublished->updated_at->toIso8601String(), 'force' => true, 'override_reason' => 'Published vPublished']
        );

        $res = $this->actingAs($this->admin)->getJson(
            route('api.v1.departments.current-distribution', $this->department1->id)
        );

        $res->assertStatus(200);
        $res->assertJsonCount(1, 'data.data');
    }

    public function test_training_site_current_distribution()
    {
        $vPublished = $this->createApprovedVersion();
        $this->actingAs($this->admin)->postJson(
            route('api.v1.distribution-versions.publish', $vPublished->id),
            ['last_updated_at' => $vPublished->updated_at->toIso8601String(), 'force' => true, 'override_reason' => 'Published vPublished']
        );

        $res = $this->actingAs($this->admin)->getJson(
            route('api.v1.training-sites.current-distribution', $this->site1->id)
        );

        $res->assertStatus(200);
        $res->assertJsonCount(1, 'data.data');
    }

    public function test_unassigned_active_students_endpoint()
    {
        $vPublished = $this->createApprovedVersion();
        $this->actingAs($this->admin)->postJson(
            route('api.v1.distribution-versions.publish', $vPublished->id),
            ['last_updated_at' => $vPublished->updated_at->toIso8601String(), 'force' => true, 'override_reason' => 'Published vPublished']
        );

        $res = $this->actingAs($this->admin)->getJson(
            route('api.v1.rotations.current-distribution.unassigned', $this->rotation->id)
        );

        $res->assertStatus(200);
        $res->assertJsonCount(1, 'data.data');
        // student2 is active and unassigned, student1 is assigned, inactiveStudent is suspended and excluded
        $this->assertEquals($this->student2->id, $res->json('data.data.0.id'));
    }

    public function test_unauthenticated_and_unauthorized_users_rejected()
    {
        // Unauthenticated check before actingAs
        $this->getJson(route('api.v1.rotations.current-distribution', $this->rotation->id))
            ->assertStatus(401);

        $vPublished = $this->createApprovedVersion();
        $this->actingAs($this->admin)->postJson(
            route('api.v1.distribution-versions.publish', $vPublished->id),
            ['last_updated_at' => $vPublished->updated_at->toIso8601String(), 'force' => true, 'override_reason' => 'Published vPublished']
        );

        // Unauthorized (lacks distribution.view)
        $this->actingAs($this->unauthorized)
            ->getJson(route('api.v1.rotations.current-distribution', $this->rotation->id))
            ->assertStatus(403);
    }

    public function test_no_n_plus_one_queries_on_schedule_endpoints()
    {
        $vPublished = $this->createApprovedVersion();
        $this->actingAs($this->admin)->postJson(
            route('api.v1.distribution-versions.publish', $vPublished->id),
            ['last_updated_at' => $vPublished->updated_at->toIso8601String(), 'force' => true, 'override_reason' => 'Published vPublished']
        );

        DB::enableQueryLog();

        $this->actingAs($this->admin)->getJson(
            route('api.v1.students.current-clinical-schedule', $this->student1->id)
        )->assertStatus(200);

        $queryCount = count(DB::getQueryLog());
        $this->assertLessThanOrEqual(12, $queryCount);
    }
}
