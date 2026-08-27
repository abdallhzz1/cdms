<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DistributionVersion;
use App\Services\Distribution\DistributionApprovalService;
use App\Traits\ScopesByDepartmentAndLevel;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class DistributionApprovalController extends Controller
{
    use ScopesByDepartmentAndLevel;

    public function __construct(
        private DistributionApprovalService $approvalService
    ) {}

    public function store(Request $request, DistributionVersion $version): JsonResponse
    {
        $this->ensureVersionInUserScope($version);
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

    private function ensureVersionInUserScope(DistributionVersion $version): void
    {
        $version->loadMissing('rotation');
        abort_unless($version->rotation, 404);
        $levelScope = $this->getEffectiveAcademicLevelScope();
        abort_if($levelScope !== null && ! in_array($version->rotation->academic_level, $levelScope, true), 404);
    }
}
