<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DistributionVersion;
use App\Services\Distribution\DistributionVersionComparisonService;
use Illuminate\Http\JsonResponse;

class DistributionVersionComparisonController extends Controller
{
    public function __construct(
        private DistributionVersionComparisonService $comparisonService
    ) {}

    public function show(DistributionVersion $version, DistributionVersion $otherVersion): JsonResponse
    {
        $comparison = $this->comparisonService->compare($version, $otherVersion);

        return response()->json([
            'message' => 'Version comparison successful.',
            'data' => $comparison
        ], 200);
    }
}
