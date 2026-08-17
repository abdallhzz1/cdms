<?php

namespace Tests\Feature\Phase3B3;

use App\Models\AcademicYear;
use App\Models\Department;
use App\Models\DistributionConflict;
use App\Models\DistributionVersion;
use App\Models\Rotation;
use App\Models\RotationBlock;
use App\Models\SiteCapacityRule;
use App\Models\StudentGroup;
use App\Models\StudentGroupAssignment;
use App\Models\StudentSubgroup;
use App\Models\StudentClinicalAssignment;
use App\Models\TrainingSite;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class DistributionGenerationTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $unauthorized;
    private Rotation $rotation;
    private StudentGroup $group;
    
    // Testing entities
    private StudentSubgroup $sg1;
    private StudentSubgroup $sg2;
    private StudentSubgroup $sg3;
    
    private RotationBlock $block1;
    private RotationBlock $block2;
    private TrainingSite $siteA;
    private TrainingSite $siteB;

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
        
        $this->unauthorized = User::factory()->create();

        $academicYear = AcademicYear::factory()->create(['is_current' => true]);
        $department = Department::factory()->create();

        $this->group = StudentGroup::factory()->create([
            'academic_year_id' => $academicYear->id,
            'academic_level' => 'fourth',
        ]);

        $this->rotation = Rotation::factory()->create([
            'academic_year_id' => $academicYear->id,
            'academic_level' => 'fourth',
        ]);

        $this->rotation->departments()->attach($department);

        $this->block1 = RotationBlock::factory()->create([
            'rotation_id' => $this->rotation->id,
            'from_week' => 1,
            'to_week' => 4,
        ]);

        $this->block2 = RotationBlock::factory()->create([
            'rotation_id' => $this->rotation->id,
            'from_week' => 5,
            'to_week' => 8,
        ]);

        $this->siteA = TrainingSite::factory()->create();
        $this->siteB = TrainingSite::factory()->create();

        $this->rotation->siteCapacityRules()->create([
            'site_id' => $this->siteA->id,
            'max_students' => 10
        ]);

        $this->rotation->siteCapacityRules()->create([
            'site_id' => $this->siteB->id,
            'max_students' => 10
        ]);

        // SG1: 5 students
        $this->sg1 = StudentSubgroup::factory()->create(['student_group_id' => $this->group->id, 'min_size' => 5, 'max_size' => 5]);
        for ($i=0; $i<5; $i++) {
            $s = \App\Models\Student::factory()->create(['academic_level' => 'fourth']);
            StudentGroupAssignment::factory()->create([
                'student_id' => $s->id,
                'student_subgroup_id' => $this->sg1->id,
                'academic_year_id' => $academicYear->id,
            ]);
        }

        // SG2: 6 students
        $this->sg2 = StudentSubgroup::factory()->create(['student_group_id' => $this->group->id, 'min_size' => 6, 'max_size' => 6]);
        for ($i=0; $i<6; $i++) {
            $s = \App\Models\Student::factory()->create(['academic_level' => 'fourth']);
            StudentGroupAssignment::factory()->create([
                'student_id' => $s->id,
                'student_subgroup_id' => $this->sg2->id,
                'academic_year_id' => $academicYear->id,
            ]);
        }

        // SG3: 4 students
        $this->sg3 = StudentSubgroup::factory()->create(['student_group_id' => $this->group->id, 'min_size' => 4, 'max_size' => 4]);
        for ($i=0; $i<4; $i++) {
            $s = \App\Models\Student::factory()->create(['academic_level' => 'fourth']);
            StudentGroupAssignment::factory()->create([
                'student_id' => $s->id,
                'student_subgroup_id' => $this->sg3->id,
                'academic_year_id' => $academicYear->id,
            ]);
        }
    }

    public function test_successful_generation_persists_version_and_assignments()
    {
        $response = $this->actingAs($this->admin)->postJson(route('api.v1.rotations.distribution.generate', $this->rotation->id));
        
        $response->assertStatus(200);
        
        $data = $response->json('data');
        $this->assertEquals('SUCCESS', $data['algorithm_status']);
        $this->assertEquals(3, $data['assigned_subgroups']);
        $this->assertEquals(15, $data['student_assignments_created']); // 5 + 6 + 4
        $this->assertEquals(0, $data['unassigned_subgroups']);
        
        $versionId = $data['distribution_version_id'];
        
        $this->assertDatabaseHas('distribution_versions', [
            'id' => $versionId,
            'status' => 'suggested'
        ]);
        
        $this->assertDatabaseCount('student_clinical_assignments', 15);
        $this->assertDatabaseCount('distribution_conflicts', 0);
    }

    public function test_version_history_preserves_previous_generations()
    {
        $response1 = $this->actingAs($this->admin)->postJson(route('api.v1.rotations.distribution.generate', $this->rotation->id));
        $versionId1 = $response1->json('data.distribution_version_id');
        
        $response2 = $this->actingAs($this->admin)->postJson(route('api.v1.rotations.distribution.generate', $this->rotation->id));
        $versionId2 = $response2->json('data.distribution_version_id');
        
        $this->assertNotEquals($versionId1, $versionId2);
        
        $this->assertDatabaseCount('distribution_versions', 2);
        // 15 assignments for each version
        $this->assertDatabaseCount('student_clinical_assignments', 30);
    }

    public function test_unassigned_subgroups_persist_conflicts()
    {
        // Intentionally create impossible constraints: delete a block, capacity = 5.
        // SG1 (5) fits. SG2 (6) and SG3 (4) will not fit (since only 1 block and 5 cap total)
        // Actually, we have 2 sites. Site A cap = 5, Site B cap = 0.
        // Total capacity = 5. Only SG1 or SG3 can fit. Not both, not SG2.
        $this->rotation->siteCapacityRules()->where('site_id', $this->siteA->id)->update(['max_students' => 5]);
        $this->rotation->siteCapacityRules()->where('site_id', $this->siteB->id)->update(['max_students' => 0]);
        $this->block2->delete();
        
        $response = $this->actingAs($this->admin)->postJson(route('api.v1.rotations.distribution.generate', $this->rotation->id));
        $response->assertStatus(200);
        
        $data = $response->json('data');
        $this->assertEquals('PARTIAL_IMPOSSIBLE', $data['algorithm_status']);
        $this->assertEquals(1, $data['assigned_subgroups']);
        $this->assertEquals(2, $data['unassigned_subgroups']);
        $this->assertEquals(2, $data['conflicts']);
        
        $versionId = $data['distribution_version_id'];
        
        $this->assertDatabaseHas('distribution_conflicts', [
            'distribution_version_id' => $versionId,
            'rule_code' => 'UNASSIGNABLE'
        ]);
        
        $this->assertDatabaseCount('distribution_conflicts', 2);
    }

    public function test_transaction_rollback_on_final_validation_failure()
    {
        // We will fake a capacity violation by mutating the final validation mock or 
        // forcing a final validation failure. 
        // A cleaner way is to mock DistributionValidationService to always fail.
        $mock = \Mockery::mock(\App\Services\Distribution\DistributionValidationService::class);
        $mock->shouldReceive('validate')->andReturn([
            'valid' => false,
            'violations' => [['code' => 'FAKE_ERROR', 'message' => 'Test induced failure']]
        ]);
        $this->app->instance(\App\Services\Distribution\DistributionValidationService::class, $mock);
        
        $response = $this->actingAs($this->admin)->postJson(route('api.v1.rotations.distribution.generate', $this->rotation->id));
        
        $response->assertStatus(500); // Because it throws an Exception on final validation failure
        
        // Assert NOTHING was persisted (rollback successful)
        $this->assertDatabaseCount('distribution_versions', 0);
        $this->assertDatabaseCount('student_clinical_assignments', 0);
        $this->assertDatabaseCount('distribution_conflicts', 0);
    }

    public function test_no_n_plus_one_queries_during_persistence()
    {
        DB::enableQueryLog();
        
        $response = $this->actingAs($this->admin)->postJson(route('api.v1.rotations.distribution.generate', $this->rotation->id));
        $response->assertStatus(200);
        
        $queryCount = count(DB::getQueryLog());
        
        // We expect:
        // Auth/permission check (~5 queries)
        // Context generation & Candidate generation (~10 queries)
        // Version insert (1)
        // Students fetch (1)
        // Bulk assignments insert (1)
        // Bulk conflicts insert (0 since none)
        // Final validation (0 DB queries since it uses Context)
        // Total around ~15-20. Definitely less than 40.
        $this->assertLessThan(40, $queryCount, "Generation executed $queryCount queries. Potential N+1 issue.");
    }
    
    public function test_requires_permission()
    {
        $response = $this->actingAs($this->unauthorized)->postJson(route('api.v1.rotations.distribution.generate', $this->rotation->id));
        $response->assertStatus(403);
    }

    public function test_inactive_students_are_excluded_from_automatic_distribution()
    {
        // One of the students in SG1 (5 students) becomes suspended.
        $studentToSuspendId = StudentGroupAssignment::where('student_subgroup_id', $this->sg1->id)->first()->student_id;
        $studentToSuspend = \App\Models\Student::find($studentToSuspendId);
        $studentToSuspend->update(['registration_status' => 'suspended']);

        $response = $this->actingAs($this->admin)->postJson(route('api.v1.rotations.distribution.generate', $this->rotation->id));
        $response->assertStatus(200);

        $data = $response->json('data');
        
        // Active students overall: 5-1(from SG1) + 6(SG2) + 4(SG3) = 14 assignments expected
        $this->assertEquals(14, $data['student_assignments_created']);

        $versionId = $data['distribution_version_id'];

        $this->assertDatabaseMissing('student_clinical_assignments', [
            'distribution_version_id' => $versionId,
            'student_id' => $studentToSuspendId
        ]);

        // Let's verify an active student from the same subgroup DID get an assignment
        $activeStudentId = StudentGroupAssignment::where('student_subgroup_id', $this->sg1->id)
            ->where('student_id', '!=', $studentToSuspendId)
            ->first()->student_id;
            
        $this->assertDatabaseHas('student_clinical_assignments', [
            'distribution_version_id' => $versionId,
            'student_id' => $activeStudentId
        ]);
    }
}
