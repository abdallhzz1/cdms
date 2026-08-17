<?php

namespace Tests\Feature\Phase3B3;

use App\DTOs\CandidateAssignmentDTO;
use App\DTOs\CandidateGenerationResultDTO;
use App\Models\AcademicYear;
use App\Models\Department;
use App\Models\Rotation;
use App\Models\RotationBlock;
use App\Models\SiteCapacityRule;
use App\Models\StudentGroup;
use App\Models\StudentGroupAssignment;
use App\Models\StudentSubgroup;
use App\Models\TrainingSite;
use App\Models\User;
use App\Services\Distribution\DistributionAlgorithmService;
use App\Services\Distribution\DistributionCandidateGeneratorService;
use App\Services\Distribution\DistributionValidationContextBuilder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class DistributionAlgorithmTest extends TestCase
{
    use RefreshDatabase;

    private DistributionAlgorithmService $algorithmService;
    private DistributionCandidateGeneratorService $generatorService;
    private DistributionValidationContextBuilder $contextBuilder;
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
        
        $this->algorithmService = app(DistributionAlgorithmService::class);
        $this->generatorService = app(DistributionCandidateGeneratorService::class);
        $this->contextBuilder = app(DistributionValidationContextBuilder::class);

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

        // Base capacity rules (will be adjusted in tests)
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
            StudentGroupAssignment::factory()->create([
                'student_subgroup_id' => $this->sg1->id,
                'academic_year_id' => $academicYear->id,
            ]);
        }

        // SG2: 6 students
        $this->sg2 = StudentSubgroup::factory()->create(['student_group_id' => $this->group->id, 'min_size' => 6, 'max_size' => 6]);
        for ($i=0; $i<6; $i++) {
            StudentGroupAssignment::factory()->create([
                'student_subgroup_id' => $this->sg2->id,
                'academic_year_id' => $academicYear->id,
            ]);
        }

        // SG3: 4 students
        $this->sg3 = StudentSubgroup::factory()->create(['student_group_id' => $this->group->id, 'min_size' => 4, 'max_size' => 4]);
        for ($i=0; $i<4; $i++) {
            StudentGroupAssignment::factory()->create([
                'student_subgroup_id' => $this->sg3->id,
                'academic_year_id' => $academicYear->id,
            ]);
        }
    }

    public function test_zero_queries_during_search_and_determinism()
    {
        // Adjust capacity so everyone fits easily anywhere.
        // SG1 (5), SG2 (6), SG3 (4). Total 15. Capacity 20 each site.
        SiteCapacityRule::where('site_id', $this->siteA->id)->update(['max_students' => 20]);
        SiteCapacityRule::where('site_id', $this->siteB->id)->update(['max_students' => 20]);

        // Generate Candidates and Context
        $candidateSpace = $this->generatorService->generate($this->rotation);
        $context = $this->contextBuilder->buildForGeneration($this->rotation);

        DB::enableQueryLog();

        $result1 = $this->algorithmService->execute($this->rotation, $context, $candidateSpace);
        
        $queryCount = count(DB::getQueryLog());
        
        $this->assertEquals(0, $queryCount, "Algorithm executed $queryCount queries during search. It must execute exactly 0.");
        
        $this->assertTrue($result1->success);
        $this->assertEquals('SUCCESS', $result1->status);
        $this->assertCount(3, $result1->selectedAssignments);
        $this->assertCount(0, $result1->unassignedSubgroups);

        // Determinism test: calling it again must produce exact same assignments in exact same order
        $result2 = $this->algorithmService->execute($this->rotation, $context, $candidateSpace);
        $this->assertEquals($result1->selectedAssignments, $result2->selectedAssignments);
    }

    public function test_backtracking_scenario()
    {
        // Scenario: 
        // SG1 (size 5), SG2 (size 6)
        // Site A capacity: 6 (per block)
        // Site B capacity: 5 (per block)
        // Block 1 only (let's delete block 2 for this specific test)
        $this->block2->delete();

        SiteCapacityRule::where('site_id', $this->siteA->id)->update(['max_students' => 6]);
        SiteCapacityRule::where('site_id', $this->siteB->id)->update(['max_students' => 5]);

        // SG3 is inactive for this test
        $this->sg3->update(['is_active' => false]);

        // SG2 (size 6) ONLY fits in Site A (cap 6). It will FAIL at Site B (cap 5).
        // SG1 (size 5) fits in BOTH Site A and Site B.
        // The generator will create valid candidates:
        // SG1 -> Site A
        // SG1 -> Site B
        // SG2 -> Site A
        
        // At the root, SG1 has 2 valid candidates, SG2 has 1 valid candidate.
        // If the algorithm naively picks SG1 and greedily assigns it to Site A (because A comes first),
        // Site A's capacity becomes 1. 
        // Then SG2 (size 6) tries to fit into Site A, but cap is 1. SG2 fails.
        // The algorithm MUST backtrack and re-assign SG1 to Site B, so SG2 can take Site A.

        $candidateSpace = $this->generatorService->generate($this->rotation);
        $context = $this->contextBuilder->buildForGeneration($this->rotation);

        $result = $this->algorithmService->execute($this->rotation, $context, $candidateSpace);

        $this->assertTrue($result->success);
        $this->assertEquals('SUCCESS', $result->status);
        $this->assertCount(2, $result->selectedAssignments);

        // Find placements
        $sg1Placement = collect($result->selectedAssignments)->firstWhere('subgroup_id', $this->sg1->id);
        $sg2Placement = collect($result->selectedAssignments)->firstWhere('subgroup_id', $this->sg2->id);

        $this->assertEquals($this->siteB->id, $sg1Placement->site_id, "SG1 must be assigned to Site B to leave room for SG2 in Site A.");
        $this->assertEquals($this->siteA->id, $sg2Placement->site_id, "SG2 must be assigned to Site A.");
    }

    public function test_impossible_distribution_returns_best_partial()
    {
        // Limit capacity so only one subgroup can fit anywhere.
        SiteCapacityRule::where('site_id', $this->siteA->id)->update(['max_students' => 6]);
        // Delete site B capacity rule entirely so no one can go there
        SiteCapacityRule::where('site_id', $this->siteB->id)->delete();
        $this->block2->delete();

        // We have SG1(5), SG2(6), SG3(4).
        // Site A cap = 6 in Block 1.
        // Any subgroup can fit alone. 
        // SG3 (4) + nothing else fits.
        // The most that can be assigned is 1 subgroup. (Because any pair is >= 9 students, which > 6).

        $candidateSpace = $this->generatorService->generate($this->rotation);
        $context = $this->contextBuilder->buildForGeneration($this->rotation);

        $result = $this->algorithmService->execute($this->rotation, $context, $candidateSpace);

        $this->assertFalse($result->success);
        $this->assertEquals('PARTIAL_IMPOSSIBLE', $result->status);
        $this->assertCount(1, $result->selectedAssignments, "Should return best partial assignment of exactly 1 subgroup.");
        $this->assertCount(2, $result->unassignedSubgroups, "Two subgroups should be left unassigned.");
    }
}
