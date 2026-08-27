<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Services\DashboardOverviewService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardOverviewController extends Controller
{
    public function __construct(private DashboardOverviewService $dashboard) {}

    public function show(Request $request): JsonResponse
    {
        return ApiResponse::success(
            $this->dashboard->forUser($request->user()),
            'Dashboard overview retrieved successfully.',
            ['generated_at' => now()->toIso8601String()],
        );
    }
}
