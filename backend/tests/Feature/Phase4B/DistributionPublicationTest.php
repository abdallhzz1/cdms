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
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DistributionPublicationTest extends TestCase
{
    use RefreshDatabase;

    private User $publishAdmin;
    private DistributionVersion $version;
    private Student $student1;
    private RotationBlock $block1;
    private TrainingSite $site1;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([\Database\Seeders\PermissionSeeder::class, \Database\Seeders\RoleSeeder::class, \Database\Seeders\RolePermissionSeeder::class]);

        $publishRole = \App\Models\Role::create(['code' => 'TEST_PUBLISH', 'name_key' => 'publish', 'name_ar' => 'Publish', 'name_en' => 'Publish']);
        $publishRole->permissions()->sync(\App\Models\Permission::whereIn('code', [
            'distribution.approve',
            'distribution.publish'
        ])->pluck('id')->mapWithKeys(fn($id) => [$id => ['scope_type' => 'global']])->all());

        $this->publishAdmin = User::factory()->create();
        $this->publishAdmin->roles()->attach($publishRole);

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

        StudentClinicalAssignment::create([
            'distribution_version_id' => $this->version->id,
            'student_id' => $this->student1->id,
            'student_subgroup_id' => $subgroup->id,
            'rotation_block_id' => $this->block1->id,
            'training_site_id' => $this->site1->id,
            'department_id' => $this->block1->department_id,
        ]);
    }

    private function approveVersion()
    {
        $this->actingAs($this->publishAdmin)->postJson(route('api.v1.distribution-versions.approve', $this->version->id));
    }

    public function test_authorized_user_can_publish_approved_version()
    {
        $this->approveVersion();

        $response = $this->actingAs($this->publishAdmin)->postJson(
            route('api.v1.distribution-versions.publish', $this->version->id),
            ['last_updated_at' => $this->version->fresh()->updated_at->toIso8601String()]
        );

        $response->assertStatus(200);
        $this->assertEquals('published', $this->version->fresh()->status);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'version.published',
            'distribution_version_id' => $this->version->id
        ]);
    }

    public function test_publication_accepts_json_timestamp_format_sent_by_spa()
    {
        $this->approveVersion();

        $this->actingAs($this->publishAdmin)->postJson(
            route('api.v1.distribution-versions.publish', $this->version->id),
            ['last_updated_at' => $this->version->fresh()->updated_at->toJSON()]
        )->assertOk();

        $this->assertEquals('published', $this->version->fresh()->status);
    }

    public function test_unapproved_version_cannot_publish()
    {
        $response = $this->actingAs($this->publishAdmin)->postJson(
            route('api.v1.distribution-versions.publish', $this->version->id),
            ['last_updated_at' => $this->version->fresh()->updated_at->toIso8601String()]
        );

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('approval');
    }

    public function test_publication_concurrency_protection()
    {
        $this->approveVersion();

        $oldDate = \Carbon\Carbon::now()->subMinutes(5)->toIso8601String();

        $response = $this->actingAs($this->publishAdmin)->postJson(
            route('api.v1.distribution-versions.publish', $this->version->id),
            ['last_updated_at' => $oldDate]
        );

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('concurrency');
    }

    public function test_superseding_previous_published_version()
    {
        // Setup existing published version
        $oldVersion = DistributionVersion::create([
            'rotation_id' => $this->version->rotation_id,
            'status' => 'published'
        ]);

        $this->approveVersion();

        $response = $this->actingAs($this->publishAdmin)->postJson(
            route('api.v1.distribution-versions.publish', $this->version->id),
            ['last_updated_at' => $this->version->fresh()->updated_at->toIso8601String()]
        );

        $response->assertStatus(200);
        
        $this->assertEquals('published', $oldVersion->fresh()->status); // Keeps status as published (business rules)
        
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'version.superseded',
            'entity_id' => $oldVersion->id
        ]);
    }
}
