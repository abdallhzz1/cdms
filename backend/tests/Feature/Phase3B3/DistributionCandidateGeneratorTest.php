<?php

namespace Tests\Feature\Phase3B3;

use App\Models\AcademicYear;
use App\Models\Department;
use App\Models\Rotation;
use App\Models\RotationBlock;
use App\Models\StudentGroup;
use App\Models\StudentSubgroup;
use App\Models\TrainingSite;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DistributionCandidateGeneratorTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private AcademicYear $academicYear;
    private Rotation $rotation;
    private RotationBlock $block1;
    private RotationBlock $block2;
    private TrainingSite $site1;
    private TrainingSite $site2;
    private StudentSubgroup $subgroup1;
    private StudentSubgroup $subgroup2;
    private StudentSubgroup $ineligibleSubgroup;

    protected function setUp(): void
    {
        parent::setUp();
        
        $this->seed([
            \Database\Seeders\PermissionSeeder::class,
            \Database\Seeders\Phase3PermissionSeeder::class,
            \Database\Seeders\RoleSeeder::class,
            \Database\Seeders\RolePermissionSeeder::class,
        ]);

        $sysAdminRole = \App\Models\Role::where('code', 'SYS_ADMIN')->first();
        $sysAdminRole->permissions()->sync(\App\Models\Permission::pluck('id')->mapWithKeys(fn($id) => [$id => ['scope_type' => 'global']])->all());

        $this->admin = User::factory()->create();
        $this->admin->roles()->attach($sysAdminRole);

        $this->academicYear = AcademicYear::factory()->create();

        $this->rotation = Rotation::factory()->create([
            'academic_year_id' => $this->academicYear->id,
            'academic_level' => 'fifth'
        ]);

        $dept = Department::factory()->create();

        $this->block1 = RotationBlock::factory()->create([
            'rotation_id' => $this->rotation->id,
            'department_id' => $dept->id,
            'from_week' => 1,
            'to_week' => 4
        ]);
        $this->block2 = RotationBlock::factory()->create([
            'rotation_id' => $this->rotation->id,
            'department_id' => $dept->id,
            'from_week' => 5,
            'to_week' => 8
        ]);

        $this->site1 = TrainingSite::factory()->create();
        $this->site2 = TrainingSite::factory()->create();

        $this->rotation->siteCapacityRules()->create([
            'site_id' => $this->site1->id,
            'max_students' => 10
        ]);
        $this->rotation->siteCapacityRules()->create([
            'site_id' => $this->site2->id,
            'max_students' => 2 // very low capacity for testing rejection
        ]);

        $group = StudentGroup::factory()->create([
            'academic_year_id' => $this->academicYear->id,
            'academic_level' => 'fifth'
        ]);

        // Total size 5
        $this->subgroup1 = StudentSubgroup::factory()->create([
            'student_group_id' => $group->id,
            'min_size' => 5,
            'max_size' => 5
        ]);

        // Total size 5
        $this->subgroup2 = StudentSubgroup::factory()->create([
            'student_group_id' => $group->id,
            'min_size' => 5,
            'max_size' => 5
        ]);

        // Add 5 students to subgroup1
        for ($i = 0; $i < 5; $i++) {
            $student = \App\Models\Student::factory()->create();
            \App\Models\StudentGroupAssignment::create([
                'student_id' => $student->id,
                'academic_year_id' => $this->academicYear->id,
                'student_group_id' => $group->id,
                'student_subgroup_id' => $this->subgroup1->id,
                'valid_from' => now()->subDay(),
            ]);
        }

        // Add 5 students to subgroup2
        for ($i = 0; $i < 5; $i++) {
            $student = \App\Models\Student::factory()->create();
            \App\Models\StudentGroupAssignment::create([
                'student_id' => $student->id,
                'academic_year_id' => $this->academicYear->id,
                'student_group_id' => $group->id,
                'student_subgroup_id' => $this->subgroup2->id,
                'valid_from' => now()->subDay(),
            ]);
        }

        // Ineligible (wrong level)
        $groupWrongLevel = StudentGroup::factory()->create([
            'academic_year_id' => $this->academicYear->id,
            'academic_level' => 'sixth'
        ]);
        $this->ineligibleSubgroup = StudentSubgroup::factory()->create([
            'student_group_id' => $groupWrongLevel->id,
            'min_size' => 5,
            'max_size' => 5,
            'is_active' => true
        ]);

        $this->inactiveSubgroup = StudentSubgroup::factory()->create([
            'student_group_id' => $group->id,
            'min_size' => 5,
            'max_size' => 5,
            'is_active' => false
        ]);
    }

    public function test_candidate_generation_builds_correct_matrix()
    {
        $response = $this->actingAs($this->admin)->getJson(route('api.v1.rotations.distribution.candidates', $this->rotation->id));

        $response->assertStatus(200);

        $data = $response->json('data');
        $this->assertArrayHasKey('valid_candidates', $data);
        $this->assertArrayHasKey('rejected_candidates', $data);

        $valid = $data['valid_candidates'];
        $rejected = $data['rejected_candidates'];

        // Subgroups * Blocks * Sites = 2 * 2 * 2 = 8 combinations
        // Subgroup 1 & 2 are both size 5. Site 1 has max 10. Site 2 has max 2.
        // Therefore, any assignment to Site 2 will fail capacity individually.
        
        $this->assertCount(4, $valid); // 2 subgroups * 2 blocks * 1 valid site (site1)
        $this->assertCount(4, $rejected); // 2 subgroups * 2 blocks * 1 invalid site (site2)

        // Ensure ineligible and inactive subgroups are completely ignored (no combinations for them)
        $subgroupIds = collect($valid)->pluck('subgroup_id')->unique()->toArray();
        $this->assertNotContains($this->ineligibleSubgroup->id, $subgroupIds);
        $this->assertNotContains($this->inactiveSubgroup->id, $subgroupIds);

        // Assert determinism ordering
        $this->assertEquals($this->subgroup1->id, $valid[0]['subgroup_id']);
        $this->assertEquals($this->block1->id, $valid[0]['rotation_block_id']);
        $this->assertEquals($this->site1->id, $valid[0]['site_id']);

        $this->assertEquals($this->subgroup1->id, $valid[1]['subgroup_id']);
        $this->assertEquals($this->block2->id, $valid[1]['rotation_block_id']);
        $this->assertEquals($this->site1->id, $valid[1]['site_id']);

        $this->assertEquals($this->subgroup2->id, $valid[2]['subgroup_id']);
        $this->assertEquals($this->block1->id, $valid[2]['rotation_block_id']);
        $this->assertEquals($this->site1->id, $valid[2]['site_id']);

        $this->assertEquals($this->subgroup2->id, $valid[3]['subgroup_id']);
        $this->assertEquals($this->block2->id, $valid[3]['rotation_block_id']);
        $this->assertEquals($this->site1->id, $valid[3]['site_id']);
        
        // Assert rejection reason
        $this->assertEquals('CAPACITY_EXCEEDED', $rejected[0]['violations'][0]['code']);
    }

    public function test_generator_avoids_n_plus_one_queries()
    {
        // Add more subgroups to significantly increase permutations
        $group = $this->subgroup1->group;
        for ($i = 0; $i < 8; $i++) {
            $sg = StudentSubgroup::factory()->create([
                'student_group_id' => $group->id,
                'min_size' => 5,
                'max_size' => 5,
                'is_active' => true
            ]);
        }
        // We now have 10 active subgroups. 10 subgroups * 2 blocks * 2 sites = 40 permutations.
        // If N+1 exists (~4 queries per permutation), we would see ~160 queries.
        // With ContextBuilder, we expect < 10 queries.

        \Illuminate\Support\Facades\DB::enableQueryLog();

        $response = $this->actingAs($this->admin)->getJson(route('api.v1.rotations.distribution.candidates', $this->rotation->id));
        $response->assertStatus(200);

        $queryCount = count(\Illuminate\Support\Facades\DB::getQueryLog());
        
        // Assert query count is bounded and well below 160
        $this->assertLessThan(10, $queryCount, "Generator executed $queryCount queries, which indicates an N+1 issue or unbounded query execution.");
    }

    public function test_requires_permission()
    {
        $guest = User::factory()->create();
        $this->actingAs($guest)
             ->getJson(route('api.v1.rotations.distribution.candidates', $this->rotation->id))
             ->assertStatus(403);
    }
}
