<?php

namespace Tests\Feature\Phase4B;

use App\Models\DistributionVersion;
use App\Models\Rotation;
use App\Models\RotationBlock;
use App\Models\Student;
use App\Models\StudentClinicalAssignment;
use App\Models\TrainingSite;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DistributionVersionComparisonTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private Rotation $rotation;
    private DistributionVersion $versionA;
    private DistributionVersion $versionB;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([\Database\Seeders\PermissionSeeder::class, \Database\Seeders\RoleSeeder::class, \Database\Seeders\RolePermissionSeeder::class]);

        $adminRole = \App\Models\Role::create(['code' => 'TEST_ADMIN', 'name_key' => 'admin', 'name_ar' => 'Admin', 'name_en' => 'Admin']);
        $adminRole->permissions()->sync(\App\Models\Permission::whereIn('code', [
            'distribution.view',
        ])->pluck('id')->mapWithKeys(fn($id) => [$id => ['scope_type' => 'global']])->all());

        $this->admin = User::factory()->create();
        $this->admin->roles()->attach($adminRole);

        $this->rotation = Rotation::factory()->create();

        $this->versionA = DistributionVersion::create([
            'rotation_id' => $this->rotation->id,
            'status' => 'published'
        ]);

        $this->versionB = DistributionVersion::create([
            'rotation_id' => $this->rotation->id,
            'status' => 'suggested'
        ]);
    }

    public function test_comparison_detects_all_changes()
    {
        $block1 = RotationBlock::factory()->create(['rotation_id' => $this->rotation->id]);
        $block2 = RotationBlock::factory()->create(['rotation_id' => $this->rotation->id]);
        $site1 = TrainingSite::factory()->create();
        $site2 = TrainingSite::factory()->create();

        $studentUnchanged = Student::factory()->create(['academic_year_id' => $this->rotation->academic_year_id]);
        $studentRemoved = Student::factory()->create(['academic_year_id' => $this->rotation->academic_year_id]);
        $studentAdded = Student::factory()->create(['academic_year_id' => $this->rotation->academic_year_id]);
        $studentMovedBlock = Student::factory()->create(['academic_year_id' => $this->rotation->academic_year_id]);
        $studentMovedSite = Student::factory()->create(['academic_year_id' => $this->rotation->academic_year_id]);

        // Version A
        StudentClinicalAssignment::create(['distribution_version_id' => $this->versionA->id, 'student_id' => $studentUnchanged->id, 'rotation_block_id' => $block1->id, 'training_site_id' => $site1->id]);
        StudentClinicalAssignment::create(['distribution_version_id' => $this->versionA->id, 'student_id' => $studentRemoved->id, 'rotation_block_id' => $block1->id, 'training_site_id' => $site1->id]);
        StudentClinicalAssignment::create(['distribution_version_id' => $this->versionA->id, 'student_id' => $studentMovedBlock->id, 'rotation_block_id' => $block1->id, 'training_site_id' => $site1->id]);
        StudentClinicalAssignment::create(['distribution_version_id' => $this->versionA->id, 'student_id' => $studentMovedSite->id, 'rotation_block_id' => $block1->id, 'training_site_id' => $site1->id]);

        // Version B
        StudentClinicalAssignment::create(['distribution_version_id' => $this->versionB->id, 'student_id' => $studentUnchanged->id, 'rotation_block_id' => $block1->id, 'training_site_id' => $site1->id]);
        StudentClinicalAssignment::create(['distribution_version_id' => $this->versionB->id, 'student_id' => $studentAdded->id, 'rotation_block_id' => $block1->id, 'training_site_id' => $site1->id]);
        StudentClinicalAssignment::create(['distribution_version_id' => $this->versionB->id, 'student_id' => $studentMovedBlock->id, 'rotation_block_id' => $block2->id, 'training_site_id' => $site1->id]);
        StudentClinicalAssignment::create(['distribution_version_id' => $this->versionB->id, 'student_id' => $studentMovedSite->id, 'rotation_block_id' => $block1->id, 'training_site_id' => $site2->id]);

        $response = $this->actingAs($this->admin)->getJson(
            route('api.v1.distribution-versions.compare', [$this->versionA->id, $this->versionB->id])
        );

        $response->assertStatus(200);
        $summary = $response->json('data.summary');

        $this->assertEquals(1, $summary['added']);
        $this->assertEquals(1, $summary['removed']);
        $this->assertEquals(1, $summary['moved_block']);
        $this->assertEquals(1, $summary['moved_site']);
    }

    public function test_cannot_compare_different_rotations()
    {
        $rotation2 = Rotation::factory()->create();
        $versionC = DistributionVersion::create([
            'rotation_id' => $rotation2->id,
            'status' => 'suggested'
        ]);

        $response = $this->actingAs($this->admin)->getJson(
            route('api.v1.distribution-versions.compare', [$this->versionA->id, $versionC->id])
        );

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('version');
    }
}
