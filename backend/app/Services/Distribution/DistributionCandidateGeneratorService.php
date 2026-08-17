<?php

namespace App\Services\Distribution;

use App\DTOs\CandidateAssignmentDTO;
use App\DTOs\CandidateGenerationResultDTO;
use App\Models\Rotation;
use App\Models\StudentSubgroup;

class DistributionCandidateGeneratorService
{
    public function __construct(
        private DistributionValidationService $validationService,
        private DistributionValidationContextBuilder $contextBuilder
    ) {}

    public function generate(Rotation $rotation): CandidateGenerationResultDTO
    {
        $validCandidates = [];
        $rejectedCandidates = [];

        // 1. Build Validation Context (executes ~4 queries total)
        $context = $this->contextBuilder->buildForGeneration($rotation);

        // 2. Generate Combinations purely in-memory
        foreach ($context->subgroups as $subgroup) {
            foreach ($context->blocks as $block) {
                foreach ($context->capacityRules as $rule) {
                    $assignment = new CandidateAssignmentDTO(
                        subgroup_id: $subgroup->id,
                        rotation_block_id: $block->id,
                        site_id: $rule->site_id,
                        supervisor_id: null
                    );

                    // Validate this single tuple in isolation
                    $result = $this->validationService->validate($context, [$assignment]);

                    if ($result['valid']) {
                        $validCandidates[] = $assignment;
                    } else {
                        $rejectedCandidates[] = [
                            'candidate' => $assignment,
                            'violations' => $result['violations']
                        ];
                    }
                }
            }
        }

        return new CandidateGenerationResultDTO(
            validCandidates: $validCandidates,
            rejectedCandidates: $rejectedCandidates
        );
    }
}
