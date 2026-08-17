<?php

namespace App\Services\Distribution;

use App\DTOs\CandidateAssignmentDTO;
use App\Models\Rotation;
use App\Models\StudentGroupAssignment;

class DistributionCapacityService
{
    /**
     * @param CandidateAssignmentDTO[] $assignments
     */
    public function validate(DistributionValidationContext $context, array $assignments): array
    {
        $violations = [];

        // Aggregate proposed assignments by block AND site
        // site_capacity_rules.max_students is a concurrent limit PER BLOCK.
        $proposedSiteCountsByBlock = [];
        
        foreach ($assignments as $assignment) {
            $blockId = $assignment->rotation_block_id;
            $siteId = $assignment->site_id;
            $count = $context->subgroupSizes->get($assignment->subgroup_id, 0);

            if (!isset($proposedSiteCountsByBlock[$blockId])) {
                $proposedSiteCountsByBlock[$blockId] = [];
            }
            if (!isset($proposedSiteCountsByBlock[$blockId][$siteId])) {
                $proposedSiteCountsByBlock[$blockId][$siteId] = 0;
            }
            
            $proposedSiteCountsByBlock[$blockId][$siteId] += $count;
        }

        // Evaluate against limits per block
        foreach ($proposedSiteCountsByBlock as $blockId => $siteCounts) {
            foreach ($siteCounts as $siteId => $totalStudents) {
                $rule = $context->capacityRules->get($siteId);
                
                if ($rule && $rule->max_students !== null && $totalStudents > $rule->max_students) {
                    $violations[] = [
                        'code' => 'CAPACITY_EXCEEDED',
                        'message' => "Site {$siteId} capacity exceeded in block {$blockId}. Limit: {$rule->max_students}, Proposed: {$totalStudents}",
                        'site_id' => $siteId,
                        'block_id' => $blockId,
                        'limit' => $rule->max_students,
                        'proposed' => $totalStudents,
                    ];
                }
            }
        }

        return $violations;
    }
}
