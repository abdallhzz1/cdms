<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\TrainingSite;
use App\Services\Distribution\TrainingSiteRosterService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TrainingSiteRosterController extends Controller
{
    public function __construct(
        private TrainingSiteRosterService $rosterService
    ) {}

    /**
     * GET /api/v1/training-sites/{trainingSite}/current-distribution/roster
     */
    public function roster(TrainingSite $trainingSite, Request $request): JsonResponse
    {
        $paginator = $this->rosterService->getRoster($trainingSite, $request);

        return response()->json([
            'success' => true,
            'message' => 'Training site roster retrieved successfully.',
            'data'    => $paginator,
        ]);
    }

    /**
     * GET /api/v1/training-sites/{trainingSite}/current-distribution/summary
     */
    public function summary(TrainingSite $trainingSite): JsonResponse
    {
        $summary = $this->rosterService->getSummary($trainingSite);

        return response()->json([
            'success' => true,
            'message' => 'Training site summary retrieved successfully.',
            'data'    => $summary,
        ]);
    }
}
