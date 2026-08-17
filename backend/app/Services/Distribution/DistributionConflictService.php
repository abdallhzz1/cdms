<?php

namespace App\Services\Distribution;

use App\DTOs\CandidateAssignmentDTO;
use App\Models\Rotation;

class DistributionConflictService
{
    /**
     * @param CandidateAssignmentDTO[] $assignments
     */
    public function validate(DistributionValidationContext $context, array $assignments): array
    {
        $violations = [];

        $subgroupAssignments = [];

        foreach ($assignments as $assignment) {
            $subgroupId = $assignment->subgroup_id;
            $blockId = $assignment->rotation_block_id;

            if (!isset($subgroupAssignments[$subgroupId])) {
                $subgroupAssignments[$subgroupId] = [];
            }

            $currentBlock = $context->blocks->get($blockId);

            if (!$currentBlock) {
                // Compatibility service handles this, but let's be safe
                continue;
            }

            foreach ($subgroupAssignments[$subgroupId] as $existingAssignment) {
                $existingBlock = $context->blocks->get($existingAssignment->rotation_block_id);

                // Duplicate block assignment
                if ($existingBlock->id === $currentBlock->id) {
                    $violations[] = [
                        'code' => 'DUPLICATE_ASSIGNMENT',
                        'message' => "Subgroup {$subgroupId} is assigned to block {$blockId} multiple times.",
                        'subgroup_id' => $subgroupId,
                    ];
                    continue;
                }

                // Overlapping weeks
                if (max($currentBlock->from_week, $existingBlock->from_week) <= min($currentBlock->to_week, $existingBlock->to_week)) {
                    $violations[] = [
                        'code' => 'OVERLAPPING_BLOCKS',
                        'message' => "Subgroup {$subgroupId} has overlapping assignments in blocks {$currentBlock->id} and {$existingBlock->id}.",
                        'subgroup_id' => $subgroupId,
                    ];
                }
            }

            $subgroupAssignments[$subgroupId][] = $assignment;
        }

        return $violations;
    }
}
