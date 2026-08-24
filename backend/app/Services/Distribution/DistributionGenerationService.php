<?php

namespace App\Services\Distribution;

use App\Models\DistributionConflict;
use App\Models\DistributionVersion;
use App\Models\Rotation;
use App\Models\StudentClinicalAssignment;
use App\Models\StudentGroupAssignment;
use Illuminate\Support\Facades\DB;
use Exception;

class DistributionGenerationService
{
    public function __construct(
        private DistributionValidationContextBuilder $contextBuilder,
        private DistributionCandidateGeneratorService $generatorService,
        private DistributionAlgorithmService $algorithmService,
        private DistributionValidationService $validationService
    ) {}

    public function generate(Rotation $rotation): array
    {
        return DB::transaction(function () use ($rotation) {
            // 1. Build validation context
            $context = $this->contextBuilder->buildForGeneration($rotation);
            
            // 2. Generate valid candidate space
            $candidateSpace = $this->generatorService->generate($rotation);
            
            // 3. Run search algorithm
            $algorithmResult = $this->algorithmService->execute($rotation, $context, $candidateSpace);
            
            // 4. Create new version
            $version = DistributionVersion::create([
                'rotation_id' => $rotation->id,
                'name' => 'Auto-generated ' . now()->format('Y-m-d H:i:s'),
                'status' => 'suggested'
            ]);
            
            $assignedSubgroupIds = array_map(fn($c) => $c->subgroup_id, $algorithmResult->selectedAssignments);
            
            // 5. Gather students
            $studentAssignments = collect();
            if (!empty($assignedSubgroupIds)) {
                $studentAssignments = StudentGroupAssignment::whereIn('student_subgroup_id', $assignedSubgroupIds)
                    ->where('academic_year_id', $rotation->academic_year_id)
                    ->current()
                    ->whereHas('student', function ($query) {
                        $query->where('registration_status', 'active');
                    })
                    ->get()
                    ->groupBy('student_subgroup_id');
            }
            
            $inserts = [];
            $studentAssignmentsCreated = 0;
            $now = now();
            
            foreach ($algorithmResult->selectedAssignments as $assignmentDTO) {
                $studentsInSubgroup = $studentAssignments->get($assignmentDTO->subgroup_id, collect());
                
                $block = $context->blocks->get($assignmentDTO->rotation_block_id);
                $departmentId = $block ? $block->department_id : null;

                foreach ($studentsInSubgroup as $sgAssignment) {
                    $inserts[] = [
                        'distribution_version_id' => $version->id,
                        'student_id' => $sgAssignment->student_id,
                        'student_subgroup_id' => $assignmentDTO->subgroup_id,
                        'rotation_block_id' => $assignmentDTO->rotation_block_id,
                        'training_site_id' => $assignmentDTO->site_id,
                        'department_id' => $departmentId,
                        'supervisor_id' => $assignmentDTO->supervisor_id,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ];
                    $studentAssignmentsCreated++;
                }
            }
            
            // Chunk inserts for performance (just in case it's huge)
            foreach (array_chunk($inserts, 500) as $chunk) {
                StudentClinicalAssignment::insert($chunk);
            }
            
            // 6. Record conflicts for unassigned subgroups
            $conflictInserts = [];
            foreach ($algorithmResult->unassignedSubgroups as $unassignedSubgroupId) {
                $conflictInserts[] = [
                    'distribution_version_id' => $version->id,
                    'student_subgroup_id' => $unassignedSubgroupId,
                    'student_id' => null,
                    'rotation_block_id' => null,
                    'training_site_id' => null,
                    'rule_code' => 'UNASSIGNABLE',
                    'description' => 'The algorithm could not find a valid assignment for this subgroup without violating hard capacity constraints.',
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }
            
            if (!empty($conflictInserts)) {
                DistributionConflict::insert($conflictInserts);
            }
            
            // 7. Final Safety Validation of the generated state
            $finalValidationResult = $this->validationService->validate($context, $algorithmResult->selectedAssignments);
            
            if (!$finalValidationResult['valid']) {
                // This indicates a critical failure in the engine logic. Rollback everything.
                throw new Exception("Final validation failed: " . json_encode($finalValidationResult['violations']));
            }
            
            // 8. Prepare final summary
            return [
                'distribution_version_id' => $version->id,
                'status' => $version->status,
                'algorithm_status' => $algorithmResult->status,
                'total_subgroups' => count($context->subgroups),
                'assigned_subgroups' => count($algorithmResult->selectedAssignments),
                'unassigned_subgroups' => count($algorithmResult->unassignedSubgroups),
                'student_assignments_created' => $studentAssignmentsCreated,
                'conflicts' => count($conflictInserts)
            ];
        });
    }
}
