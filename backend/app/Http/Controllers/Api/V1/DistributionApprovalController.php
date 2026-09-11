<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
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
            $approvalRequest = $this->workflowApprovals->pending('clinical_distribution', 'distribution_version', $version->id);
            if (! $approvalRequest) {
                $version->loadMissing('rotation');
                $rotation = $version->rotation;
                $query = http_build_query([
                    'academic_year_id' => $rotation?->academic_year_id,
                    'academic_level' => $rotation?->academic_level,
                    'course_id' => $rotation?->course_id,
                    'period_id' => $rotation?->schedule_scope === 'annual' ? 'annual' : $rotation?->clinical_period_id,
                ]);
                $approvalRequest = $this->workflowApprovals->submit('clinical_distribution', 'distribution_version', $version->id, $request->user(),
                    'اعتماد جدول التوزيع السريري', 'Clinical distribution approval', '/distribution?'.$query, ['rotation_id' => $version->rotation_id]);
            }
            if (! $this->workflowApprovals->canApproveCurrentStep($approvalRequest, $request->user())) {
                return ['decision' => null, 'audit' => null, 'approval_request' => $approvalRequest];
            }
            $decision = $this->workflowApprovals->approve('clinical_distribution', 'distribution_version', $version->id, $request->user(), $overrideReason);
            $audit = $decision['completed'] ? $this->approvalService->approve($version, $request->user(), $force, $overrideReason) : null;
            return compact('decision', 'audit', 'approvalRequest');
        });
        $decision = $result['decision'];
        if (! $decision) {
            return ApiResponse::success([
                'approval_status' => 'pending',
                'approval_request' => $result['approval_request'],
            ], app()->getLocale() === 'ar'
                ? 'تم إرسال الجدول للاعتماد وهو بانتظار قرار المرحلة الحالية.'
                : 'The schedule was submitted and is awaiting the current approval stage.');
        }
        if (! $decision['completed']) {
            return ApiResponse::success([
                'approval_status' => 'advanced',
                'approval_request' => $decision['request'],
            ], app()->getLocale() === 'ar' ? 'تم اعتماد مرحلتك وإرسال الجدول للمرحلة التالية.' : 'Your step was approved and sent to the next stage.');
        }

        $audit = $result['audit'];

        return ApiResponse::success([
                'approval_status' => 'approved',
                'audit_id' => $audit->id,
                'fingerprint' => $audit->changes['fingerprint']
            ], __('distribution.approval.success'));
    }

    private function ensureVersionInUserScope(DistributionVersion $version): void
    {
        $version->loadMissing('rotation');
        abort_unless($version->rotation, 404);
        $levelScope = $this->getEffectiveAcademicLevelScope();
        abort_if($levelScope !== null && ! in_array($version->rotation->academic_level, $levelScope, true), 404);
    }
}
