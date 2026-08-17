<?php

namespace App\Services\Distribution;

use App\DTOs\CandidateAssignmentDTO;
use App\Models\Rotation;
use App\Models\StudentSubgroup;

class DistributionEligibilityService
{
    /**
     * @param CandidateAssignmentDTO[] $assignments
     */
    public function validate(DistributionValidationContext $context, array $assignments): array
    {
        $violations = [];

        foreach ($assignments as $assignment) {
            $subgroup = $context->subgroups->get($assignment->subgroup_id);

            if (!$subgroup) {
                $violations[] = [
                    'code' => 'SUBGROUP_NOT_FOUND',
                    'message' => "Subgroup {$assignment->subgroup_id} does not exist or is inactive.",
                    'subgroup_id' => $assignment->subgroup_id,
                ];
                continue;
            }

            if (!$subgroup->group) {
                $violations[] = [
                    'code' => 'GROUP_NOT_FOUND',
                    'message' => "Subgroup {$assignment->subgroup_id} has no parent group.",
                    'subgroup_id' => $assignment->subgroup_id,
                ];
                continue;
            }

            // Rule: Subgroup's group academic_year_id must match Rotation's academic_year_id
            if ($subgroup->group->academic_year_id !== $context->rotation->academic_year_id) {
                $violations[] = [
                    'code' => 'ACADEMIC_YEAR_MISMATCH',
                    'message' => "Subgroup {$subgroup->name_en} belongs to a different academic year.",
                    'subgroup_id' => $assignment->subgroup_id,
                ];
            }

            // Rule: Subgroup's group academic_level must match Rotation's academic_level
            if ($subgroup->group->academic_level !== $context->rotation->academic_level) {
                $violations[] = [
                    'code' => 'ACADEMIC_LEVEL_MISMATCH',
                    'message' => "Subgroup {$subgroup->name_en} is level {$subgroup->group->academic_level}, but rotation requires {$context->rotation->academic_level}.",
                    'subgroup_id' => $assignment->subgroup_id,
                ];
            }
        }

        return $violations;
    }
}
