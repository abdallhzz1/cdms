<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DistributionVersion;
use App\Services\Distribution\DistributionApprovalService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class DistributionApprovalController extends Controller
{
    public function __construct(
        private DistributionApprovalService $approvalService
    ) {}

    public function store(Request $request, DistributionVersion $version): JsonResponse
    {
        $validated = $request->validate([
            'force' => 'boolean',
            'override_reason' => 'string|nullable',
        ]);

        $force = $validated['force'] ?? false;
        $overrideReason = $validated['override_reason'] ?? null;

        $audit = $this->approvalService->approve(
            $version,
            $request->user(),
            $force,
            $overrideReason
        );

        return response()->json([
            'message' => 'Distribution version approved successfully.',
            'data' => [
                'audit_id' => $audit->id,
                'fingerprint' => $audit->changes['fingerprint']
            ]
        ], 200);
    }
}
