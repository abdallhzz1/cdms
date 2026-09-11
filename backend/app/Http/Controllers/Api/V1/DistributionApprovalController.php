<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DistributionVersion;
use App\Services\Distribution\DistributionApprovalService;
use App\Traits\ScopesByDepartmentAndLevel;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use App\Services\Approvals\ApprovalWorkflowService;
use Illuminate\Support\Facades\DB;

class DistributionApprovalController extends Controller
{
    use ScopesByDepartmentAndLevel;

    public function __construct(
        private DistributionApprovalService $approvalService,
        private ApprovalWorkflowService $workflowApprovals,
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

        $result = DB::transaction(function () use ($request, $version, $force, $overrideReason) {
            if (! $this->workflowApprovals->pending('clinical_distribution', 'distribution_version', $version->id)) {
                $this->workflowApprovals->submit('clinical_distribution', 'distribution_version', $version->id, $request->user(),
                    'اعتماد جدول التوزيع السريري', 'Clinical distribution approval', '/distribution', ['rotation_id' => $version->rotation_id]);
            }
            $decision = $this->workflowApprovals->approve('clinical_distribution', 'distribution_version', $version->id, $request->user(), $overrideReason);
            $audit = $decision['completed'] ? $this->approvalService->approve($version, $request->user(), $force, $overrideReason) : null;
            return compact('decision', 'audit');
        });
        $decision = $result['decision'];
        if (! $decision['completed']) {
            return response()->json(['message' => app()->getLocale() === 'ar' ? 'تم اعتماد مرحلتك وإرسال الجدول للمرحلة التالية.' : 'Your step was approved and sent to the next stage.', 'data' => ['approval_request' => $decision['request']]], 200);
        }

        $audit = $result['audit'];

        return response()->json([
            'message' => __('distribution.approval.success'),
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
