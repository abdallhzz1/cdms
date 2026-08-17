<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Services\Distribution\OperationalDashboardService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class OperationalDashboardController extends Controller
{
    public function __construct(
        private OperationalDashboardService $dashboardService
    ) {}

    /**
     * GET /api/v1/operational/dashboard/summary
     *
     * Returns structured operational metrics and KPIs derived strictly from
     * current published distribution versions.
     */
    public function summary(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'academic_year_id'  => 'nullable|integer|exists:academic_years,id',
            'rotation_id'       => 'nullable|integer|exists:rotations,id',
            'rotation_block_id' => 'nullable|integer|exists:rotation_blocks,id',
            'department_id'     => 'nullable|integer|exists:departments,id',
            'training_site_id'  => 'nullable|integer|exists:training_sites,id',
            'supervisor_id'     => 'nullable|integer|exists:people,id',
            'academic_level'    => 'nullable|string|in:third,fourth,fifth,sixth',
        ]);

        if ($validator->fails()) {
            return ApiResponse::error(
                message: 'The given data was invalid.',
                errors: $validator->errors()->toArray(),
                status: 422
            );
        }

        $summary = $this->dashboardService->getSummary($request);

        return ApiResponse::success(
            data: $summary,
            message: 'Operational dashboard summary retrieved successfully.',
            meta: [
                'generated_at' => now()->toIso8601String(),
            ]
        );
    }
}
