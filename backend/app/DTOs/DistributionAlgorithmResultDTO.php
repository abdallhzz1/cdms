<?php

namespace App\DTOs;

class DistributionAlgorithmResultDTO
{
    /**
     * @param bool $success True if a complete distribution was found
     * @param string $status e.g. 'SUCCESS', 'PARTIAL_IMPOSSIBLE', 'SEARCH_LIMIT_REACHED'
     * @param CandidateAssignmentDTO[] $selectedAssignments 
     * @param int[] $unassignedSubgroups Array of subgroup IDs
     * @param array $diagnostics General diagnostic info (e.g. nodes explored)
     */
    public function __construct(
        public readonly bool $success,
        public readonly string $status,
        public readonly array $selectedAssignments,
        public readonly array $unassignedSubgroups,
        public readonly array $diagnostics
    ) {}
}
