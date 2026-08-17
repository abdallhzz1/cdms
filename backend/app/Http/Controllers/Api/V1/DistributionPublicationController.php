<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DistributionVersion;
use App\Services\Distribution\DistributionPublicationService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class DistributionPublicationController extends Controller
{
    public function __construct(
        private DistributionPublicationService $publicationService
    ) {}

    public function store(Request $request, DistributionVersion $version): JsonResponse
    {
        $validated = $request->validate([
            'last_updated_at' => 'required|string',
            'force' => 'boolean',
            'override_reason' => 'string|nullable',
        ]);

        $force = $validated['force'] ?? false;
        $overrideReason = $validated['override_reason'] ?? null;
        $lastUpdatedAt = $validated['last_updated_at'];

        $version = $this->publicationService->publish(
            $version,
            $request->user(),
            $lastUpdatedAt,
            $force,
            $overrideReason
        );

        return response()->json([
            'message' => 'Distribution version published successfully.',
            'data' => $version
        ], 200);
    }
}
