<?php

namespace App\Services\Distribution;

use App\DTOs\CandidateAssignmentDTO;
use App\Models\Rotation;

class DistributionCompatibilityService
{
    /**
     * @param CandidateAssignmentDTO[] $assignments
     */
    public function validate(DistributionValidationContext $context, array $assignments): array
    {
        $violations = [];

        foreach ($assignments as $assignment) {
            // Rule: RotationBlock must belong to the Rotation
            if (!$context->blocks->has($assignment->rotation_block_id)) {
                $violations[] = [
                    'code' => 'INVALID_BLOCK',
                    'message' => "Block {$assignment->rotation_block_id} does not belong to the specified rotation.",
                    'subgroup_id' => $assignment->subgroup_id,
                ];
            }

            // Rule: TrainingSite must be authorized for the Rotation via site_capacity_rules
            if (!$context->capacityRules->has($assignment->site_id)) {
                $violations[] = [
                    'code' => 'INVALID_SITE',
                    'message' => "Site {$assignment->site_id} is not configured for this rotation.",
                    'subgroup_id' => $assignment->subgroup_id,
                ];
            }

            // Rule: Supervisor compatibility (future-proofing based on Phase 3A people.primary_site_id)
            if ($assignment->supervisor_id) {
                // To keep it simple without executing N+1 queries, we can query in bulk later if needed.
                // For now, assume we check if the supervisor belongs to the site.
                $isSupervisorAtSite = \App\Models\Person::where('id', $assignment->supervisor_id)
                    ->where('primary_site_id', $assignment->site_id)
                    ->exists();

                if (!$isSupervisorAtSite) {
                    $violations[] = [
                        'code' => 'INVALID_SUPERVISOR',
                        'message' => "Supervisor {$assignment->supervisor_id} is not associated with site {$assignment->site_id}.",
                        'subgroup_id' => $assignment->subgroup_id,
                    ];
                }
            }
        }

        return $violations;
    }
}
