<?php

namespace Tests\Feature\Phase3B2;

use App\Models\AcademicYear;
use App\Models\Department;
use App\Models\Person;
use App\Models\Rotation;
use App\Models\RotationBlock;
use App\Models\SiteCapacityRule;
use App\Models\StudentGroup;
use App\Models\StudentGroupAssignment;
use App\Models\StudentSubgroup;
use App\Models\TrainingSite;
use App\Models\User;
use Database\Seeders\AcademicYearSeeder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\Phase3PermissionSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DistributionValidationTest extends TestCase
{
    use RefreshDatabase;

    protected User $sysAdmin;
    protected AcademicYear $academicYear;
    protected Rotation $rotation;
    protected TrainingSite $site;
    protected Department $department;
    protected StudentSubgroup $subgroup;
    protected RotationBlock $block;

    protected function setUp(): void
    {
        parent::setUp();
        
        $this->seed([
            PermissionSeeder::class,
            Phase3PermissionSeeder::class,
            RoleSeeder::class,
            RolePermissionSeeder::class,
            AcademicYearSeeder::class,
        ]);

        $sysAdminRole = \App\Models\Role::where('code', 'SYS_ADMIN')->first();
        $sysAdminRole->permissions()->sync(\App\Models\Permission::pluck('id')->mapWithKeys(fn($id) => [$id => ['scope_type' => 'global']])->all());

        $this->sysAdmin = User::factory()->create();
        $this->sysAdmin->roles()->attach($sysAdminRole);

        $this->academicYear = AcademicYear::first();
        
        $this->department = Department::factory()->create();
        $this->site = TrainingSite::factory()->create();
        
        $this->rotation = Rotation::factory()->create([
            'academic_year_id' => $this->academicYear->id,
            'academic_level' => 'fifth'
        ]);
        
        $this->block = RotationBlock::factory()->create([
            'rotation_id' => $this->rotation->id,
            'department_id' => $this->department->id,
            'from_week' => 1,
            'to_week' => 4,
        ]);
        
        SiteCapacityRule::create([
            'site_id' => $this->site->id,
            'rotation_id' => $this->rotation->id,
            'max_students' => 10,
        ]);

        $group = StudentGroup::factory()->create([
            'academic_year_id' => $this->academicYear->id,
            'academic_level' => 'fifth'
        ]);

        $this->subgroup = StudentSubgroup::factory()->create(['student_group_id' => $group->id]);

        // Add 5 students to the subgroup
        for ($i = 0; $i < 5; $i++) {
            $student = \App\Models\Student::factory()->create();
            StudentGroupAssignment::create([
                'student_id' => $student->id,
                'academic_year_id' => $this->academicYear->id,
                'student_group_id' => $group->id,
                'student_subgroup_id' => $this->subgroup->id,
                'valid_from' => now()->subDay(),
            ]);
        }
    }

    public function test_valid_assignment()
    {
        $payload = [
            'assignments' => [
                [
                    'subgroup_id' => $this->subgroup->id,
                    'rotation_block_id' => $this->block->id,
                    'site_id' => $this->site->id,
                ]
            ]
        ];

        $response = $this->actingAs($this->sysAdmin, 'web')
            ->postJson("/api/v1/rotations/{$this->rotation->id}/validate-distribution", $payload);

        $response->assertStatus(200)
            ->assertJsonPath('data.valid', true)
            ->assertJsonCount(0, 'data.violations');
    }

    public function test_eligibility_academic_year_mismatch()
    {
        $otherYear = AcademicYear::factory()->create();
        $otherGroup = StudentGroup::factory()->create(['academic_year_id' => $otherYear->id, 'academic_level' => 'fifth']);
        $otherSubgroup = StudentSubgroup::factory()->create(['student_group_id' => $otherGroup->id]);

        $payload = [
            'assignments' => [
                [
                    'subgroup_id' => $otherSubgroup->id,
                    'rotation_block_id' => $this->block->id,
                    'site_id' => $this->site->id,
                ]
            ]
        ];

        $response = $this->actingAs($this->sysAdmin, 'web')
            ->postJson("/api/v1/rotations/{$this->rotation->id}/validate-distribution", $payload);

        $response->assertStatus(200)
            ->assertJsonPath('data.valid', false)
            ->assertJsonPath('data.violations.0.code', 'ACADEMIC_YEAR_MISMATCH');
    }

    public function test_compatibility_invalid_site()
    {
        $invalidSite = TrainingSite::factory()->create(); // Not linked to rotation

        $payload = [
            'assignments' => [
                [
                    'subgroup_id' => $this->subgroup->id,
                    'rotation_block_id' => $this->block->id,
                    'site_id' => $invalidSite->id,
                ]
            ]
        ];

        $response = $this->actingAs($this->sysAdmin, 'web')
            ->postJson("/api/v1/rotations/{$this->rotation->id}/validate-distribution", $payload);

        $response->assertStatus(200)
            ->assertJsonPath('data.valid', false)
            ->assertJsonPath('data.violations.0.code', 'INVALID_SITE');
    }

    public function test_capacity_exceeded()
    {
        // Subgroup has 5 students. We will add 2 more subgroups with 5 students each, total 15 > 10.
        $group = $this->subgroup->group;
        $sg2 = StudentSubgroup::factory()->create(['student_group_id' => $group->id]);
        $sg3 = StudentSubgroup::factory()->create(['student_group_id' => $group->id]);

        for ($i = 0; $i < 5; $i++) {
            $student2 = \App\Models\Student::factory()->create();
            StudentGroupAssignment::create(['student_id' => $student2->id, 'academic_year_id' => $this->academicYear->id, 'student_group_id' => $group->id, 'student_subgroup_id' => $sg2->id]);
            $student3 = \App\Models\Student::factory()->create();
            StudentGroupAssignment::create(['student_id' => $student3->id, 'academic_year_id' => $this->academicYear->id, 'student_group_id' => $group->id, 'student_subgroup_id' => $sg3->id]);
        }

        $payload = [
            'assignments' => [
                ['subgroup_id' => $this->subgroup->id, 'rotation_block_id' => $this->block->id, 'site_id' => $this->site->id],
                ['subgroup_id' => $sg2->id, 'rotation_block_id' => $this->block->id, 'site_id' => $this->site->id],
                ['subgroup_id' => $sg3->id, 'rotation_block_id' => $this->block->id, 'site_id' => $this->site->id],
            ]
        ];

        $response = $this->actingAs($this->sysAdmin, 'web')
            ->postJson("/api/v1/rotations/{$this->rotation->id}/validate-distribution", $payload);

        $response->assertStatus(200)
            ->assertJsonPath('data.valid', false)
            ->assertJsonPath('data.violations.0.code', 'CAPACITY_EXCEEDED')
            ->assertJsonPath('data.violations.0.proposed', 15);
    }

    public function test_conflict_overlapping_blocks()
    {
        $block2 = RotationBlock::factory()->create([
            'rotation_id' => $this->rotation->id,
            'department_id' => $this->department->id,
            'from_week' => 3, // Overlaps with block 1 (weeks 1-4)
            'to_week' => 6,
        ]);

        $payload = [
            'assignments' => [
                ['subgroup_id' => $this->subgroup->id, 'rotation_block_id' => $this->block->id, 'site_id' => $this->site->id],
                ['subgroup_id' => $this->subgroup->id, 'rotation_block_id' => $block2->id, 'site_id' => $this->site->id],
            ]
        ];

        $response = $this->actingAs($this->sysAdmin, 'web')
            ->postJson("/api/v1/rotations/{$this->rotation->id}/validate-distribution", $payload);

        $response->assertStatus(200)
            ->assertJsonPath('data.valid', false)
            ->assertJsonPath('data.violations.0.code', 'OVERLAPPING_BLOCKS');
    }

    public function test_requires_permission()
    {
        $user = User::factory()->create();
        $response = $this->actingAs($user, 'web')
            ->postJson("/api/v1/rotations/{$this->rotation->id}/validate-distribution", ['assignments' => []]);
        
        $response->assertStatus(403);
    }
}
