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

class DistributionApprovalInvalidationTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private DistributionVersion $version;
    private Student $student1;
    private Student $student2;
    private RotationBlock $block1;
    private TrainingSite $site1;
    private StudentSubgroup $subgroup;
    private StudentClinicalAssignment $assignment1;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([\Database\Seeders\PermissionSeeder::class, \Database\Seeders\RoleSeeder::class, \Database\Seeders\RolePermissionSeeder::class]);

        $adminRole = \App\Models\Role::create(['code' => 'TEST_ADMIN', 'name_key' => 'admin', 'name_ar' => 'Admin', 'name_en' => 'Admin']);
        $adminRole->permissions()->sync(\App\Models\Permission::whereIn('code', [
            'distribution.view',
            'distribution.create',
            'distribution.update',
            'distribution.delete',
            'distribution.approve',
            'distribution.publish'
        ])->pluck('id')->mapWithKeys(fn($id) => [$id => ['scope_type' => 'global']])->all());

        $this->admin = User::factory()->create();
        $this->admin->roles()->attach($adminRole);

        $rotation = Rotation::factory()->create();
        $this->block1 = RotationBlock::factory()->create(['rotation_id' => $rotation->id]);
        
        $group = StudentGroup::factory()->create([
            'academic_year_id' => $rotation->academic_year_id,
            'academic_level' => $rotation->academic_level
        ]);
        $this->subgroup = StudentSubgroup::factory()->create(['student_group_id' => $group->id, 'is_active' => true]);

        $this->student1 = Student::factory()->create(['academic_year_id' => $rotation->academic_year_id]);
        \App\Models\StudentGroupAssignment::factory()->create([
            'student_id' => $this->student1->id,
            'student_subgroup_id' => $this->subgroup->id,
            'academic_year_id' => $rotation->academic_year_id
        ]);

        $this->student2 = Student::factory()->create(['academic_year_id' => $rotation->academic_year_id]);
        \App\Models\StudentGroupAssignment::factory()->create([
            'student_id' => $this->student2->id,
            'student_subgroup_id' => $this->subgroup->id,
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

        $this->assignment1 = StudentClinicalAssignment::create([
            'distribution_version_id' => $this->version->id,
            'student_id' => $this->student1->id,
            'student_subgroup_id' => $this->subgroup->id,
            'rotation_block_id' => $this->block1->id,
            'training_site_id' => $this->site1->id,
            'department_id' => $this->block1->department_id,
        ]);
    }

    private function approveVersion()
    {
        $this->actingAs($this->admin)->postJson(route('api.v1.distribution-versions.approve', $this->version->id));
        $this->assertDatabaseHas('audit_logs', ['action' => 'version.approved']);
    }

    public function test_manual_assignment_creation_invalidates_approval()
    {
        // Add another site to satisfy capacity just in case
        $site2 = TrainingSite::factory()->create();
        $this->version->rotation->siteCapacityRules()->create([
            'site_id' => $site2->id,
            'max_students' => 5
        ]);

        // Delete group assignment first to allow student deletion, or just assign student 2
        StudentClinicalAssignment::create([
            'distribution_version_id' => $this->version->id,
            'student_id' => $this->student2->id,
            'student_subgroup_id' => $this->subgroup->id,
            'rotation_block_id' => $this->block1->id,
            'training_site_id' => $this->site1->id,
            'department_id' => $this->block1->department_id,
        ]);

        $this->approveVersion();

        // Now modify
        $response = $this->actingAs($this->admin)->putJson(
            route('api.v1.distribution-versions.assignments.update', [$this->version->id, $this->assignment1->id]),
            [
                'training_site_id' => $site2->id
            ]
        );

        $response->assertStatus(200);

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'version.approval_revoked',
            'distribution_version_id' => $this->version->id
        ]);
    }
}
