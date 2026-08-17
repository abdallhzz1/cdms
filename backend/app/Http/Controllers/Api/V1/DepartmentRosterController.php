<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Services\Distribution\DepartmentRosterService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DepartmentRosterController extends Controller
{
    public function __construct(
        private DepartmentRosterService $rosterService
    ) {}

    /**
     * GET /api/v1/departments/{department}/current-distribution/roster
     */
    public function roster(Department $department, Request $request): JsonResponse
    {
        $paginator = $this->rosterService->getRoster($department, $request);

        return response()->json([
            'success' => true,
            'message' => 'Department roster retrieved successfully.',
            'data'    => $paginator,
        ]);
    }

    /**
     * GET /api/v1/departments/{department}/current-distribution/summary
     */
    public function summary(Department $department): JsonResponse
    {
        $summary = $this->rosterService->getSummary($department);

        return response()->json([
            'success' => true,
            'message' => 'Department summary retrieved successfully.',
            'data'    => $summary,
        ]);
    }
}
