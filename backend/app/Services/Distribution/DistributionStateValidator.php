<?php

namespace App\Services\Distribution;

use App\DTOs\CandidateAssignmentDTO;
use App\Models\DistributionVersion;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Facades\Gate;

class DistributionStateValidator
{
    public function __construct(
        private DistributionValidationService $validationService
    ) {}

    /**
     * Validates an entire array of assignments (in array format, e.g., from DB or memory)
     * using the Phase 3B Validation Service without N+1 queries.
     * 
     * @param DistributionVersion $version
     * @param array $assignments
     * @param bool $force
     * @param string|null $overrideReason
     * @return void
     * @throws ValidationException
     */
    public function validateState(
        DistributionVersion $version,
        array $assignments,
        bool $force,
        ?string $overrideReason
    ): void {
        $studentIds = array_unique(array_column($assignments, 'student_id'));

        // Load all students and their group assignments for this rotation's academic year in ONE query
        $students = \App\Models\Student::with(['groupAssignments' => function ($q) use ($version) {
            $q->where('academic_year_id', $version->rotation->academic_year_id)
              ->with('subgroup.group');
        }])->whereIn('id', $studentIds)->get()->keyBy('id');

        $dtos = [];
        $pseudoSubgroups = collect();
        $pseudoSubgroupSizes = collect();

        foreach ($assignments as $assignment) {
            $studentId = $assignment['student_id'];
            $student = $students->get($studentId);
            $groupAssignment = $student ? $student->groupAssignments->first() : null;

            // Enforce subgroup integrity
            if (!$groupAssignment || !$groupAssignment->subgroup) {
                throw ValidationException::withMessages([
                    'student_subgroup_id' => ["Student {$studentId} has no valid subgroup for the rotation's academic year."]
                ]);
            }

            $authoritativeSubgroupId = $groupAssignment->student_subgroup_id;

            if (!empty($assignment['student_subgroup_id']) && $assignment['student_subgroup_id'] != $authoritativeSubgroupId) {
                throw ValidationException::withMessages([
                    'student_subgroup_id' => ["The supplied subgroup does not match the student's actual subgroup for this academic year."]
                ]);
            }

            $pseudoSubgroupId = -$studentId; // Negative to avoid collision with real subgroups

            // Create pseudo-subgroup if not exists
            if (!$pseudoSubgroups->has($pseudoSubgroupId)) {
                $pseudoSubgroup = clone $groupAssignment->subgroup;
                $pseudoSubgroup->id = $pseudoSubgroupId;
                // Ensure relation is loaded on the clone
                $pseudoSubgroup->setRelation('group', $groupAssignment->subgroup->group);
                
                $pseudoSubgroups->put($pseudoSubgroupId, $pseudoSubgroup);
                $pseudoSubgroupSizes->put($pseudoSubgroupId, 1);
            }

            $dtos[] = new CandidateAssignmentDTO(
                subgroup_id: $pseudoSubgroupId,
                rotation_block_id: $assignment['rotation_block_id'],
                site_id: $assignment['training_site_id'],
                supervisor_id: $assignment['supervisor_id'] ?? null
            );
        }

        // Build context by creating a new instance
        $context = new \App\Services\Distribution\DistributionValidationContext(
            rotation: $version->rotation,
            blocks: $version->rotation->blocks()->get()->keyBy('id'),
            capacityRules: $version->rotation->siteCapacityRules()->get()->keyBy('site_id'),
            subgroups: $pseudoSubgroups,
            subgroupSizes: $pseudoSubgroupSizes
        );

        $validationResult = $this->validationService->validate($context, $dtos);

        if (!$validationResult['valid']) {
            if (!$force) {
                throw ValidationException::withMessages([
                    'hard_constraints' => $validationResult['violations']
                ]);
            }

            if (empty($overrideReason)) {
                throw ValidationException::withMessages([
                    'override_reason' => ['An override reason is required to bypass hard constraints.']
                ]);
            }

            if (!Gate::allows('permission', 'distribution.override')) {
                throw ValidationException::withMessages([
                    'authorization' => ['You do not have permission to override hard constraints.']
                ]);
            }
        }
    }

    /**
     * Retrieves violations array without throwing exceptions.
     */
    public function getViolations(DistributionVersion $version, array $assignments): array
    {
        $studentIds = array_unique(array_column($assignments, 'student_id'));
        if (empty($studentIds)) {
            return [];
        }

        $students = \App\Models\Student::with(['groupAssignments' => function ($q) use ($version) {
            $q->where('academic_year_id', $version->rotation->academic_year_id)
              ->with('subgroup.group');
        }])->whereIn('id', $studentIds)->get()->keyBy('id');

        $dtos = [];
        $pseudoSubgroups = collect();
        $pseudoSubgroupSizes = collect();
        $integrityViolations = [];

        foreach ($assignments as $assignment) {
            $studentId = $assignment['student_id'];
            $student = $students->get($studentId);
            $groupAssignment = $student ? $student->groupAssignments->first() : null;

            if (!$groupAssignment || !$groupAssignment->subgroup) {
                $integrityViolations[] = [
                    'type' => 'integrity',
                    'message' => "Student {$studentId} has no valid subgroup for the rotation's academic year.",
                    'student_id' => $studentId,
                ];
                continue;
            }

            $authoritativeSubgroupId = $groupAssignment->student_subgroup_id;

            if (!empty($assignment['student_subgroup_id']) && $assignment['student_subgroup_id'] != $authoritativeSubgroupId) {
                $integrityViolations[] = [
                    'type' => 'integrity',
                    'message' => "Subgroup mismatch for student {$studentId}.",
                    'student_id' => $studentId,
                ];
            }

            $pseudoSubgroupId = -$studentId;

            if (!$pseudoSubgroups->has($pseudoSubgroupId)) {
                $pseudoSubgroup = clone $groupAssignment->subgroup;
                $pseudoSubgroup->id = $pseudoSubgroupId;
                $pseudoSubgroup->setRelation('group', $groupAssignment->subgroup->group);
                
                $pseudoSubgroups->put($pseudoSubgroupId, $pseudoSubgroup);
                $pseudoSubgroupSizes->put($pseudoSubgroupId, 1);
            }

            $dtos[] = new CandidateAssignmentDTO(
                subgroup_id: $pseudoSubgroupId,
                rotation_block_id: $assignment['rotation_block_id'],
                site_id: $assignment['training_site_id'],
                supervisor_id: $assignment['supervisor_id'] ?? null
            );
        }

        $context = new \App\Services\Distribution\DistributionValidationContext(
            rotation: $version->rotation,
            blocks: $version->rotation->blocks()->get()->keyBy('id'),
            capacityRules: $version->rotation->siteCapacityRules()->get()->keyBy('site_id'),
            subgroups: $pseudoSubgroups,
            subgroupSizes: $pseudoSubgroupSizes
        );

        $validationResult = $this->validationService->validate($context, $dtos);

        return array_merge($integrityViolations, $validationResult['violations'] ?? []);
    }
}
