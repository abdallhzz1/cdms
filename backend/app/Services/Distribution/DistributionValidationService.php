<?php

namespace App\Services\Distribution;

use App\DTOs\CandidateAssignmentDTO;
use App\Models\Rotation;

class DistributionValidationService
{
    public function __construct(
        private DistributionEligibilityService $eligibilityService,
        private DistributionCompatibilityService $compatibilityService,
        private DistributionCapacityService $capacityService,
        private DistributionConflictService $conflictService
    ) {}

    /**
     * @param CandidateAssignmentDTO[] $assignments
     */
    public function validate(DistributionValidationContext $context, array $assignments): array
    {
        $violations = array_merge(
            $this->eligibilityService->validate($context, $assignments),
            $this->compatibilityService->validate($context, $assignments),
            $this->capacityService->validate($context, $assignments),
            $this->conflictService->validate($context, $assignments)
        );

        return [
            'valid' => count($violations) === 0,
            'violations' => $violations,
        ];
    }
}
