<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DistributionVersion;
use App\Services\Distribution\DistributionPublicationService;
use App\Traits\ScopesByDepartmentAndLevel;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class DistributionPublicationController extends Controller
{
    use ScopesByDepartmentAndLevel;

    public function __construct(
        private DistributionPublicationService $publicationService
    ) {}

    public function store(Request $request, DistributionVersion $version): JsonResponse
    {
        $this->ensureVersionInUserScope($version);
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
            'message' => __('distribution.publication.success'),
            'data' => $version
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
