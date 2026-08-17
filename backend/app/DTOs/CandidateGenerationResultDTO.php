<?php

namespace App\DTOs;

class CandidateGenerationResultDTO
{
    /**
     * @param CandidateAssignmentDTO[] $validCandidates
     * @param array $rejectedCandidates Array of ['candidate' => CandidateAssignmentDTO, 'violations' => array]
     */
    public function __construct(
        public readonly array $validCandidates,
        public readonly array $rejectedCandidates
    ) {}
}
