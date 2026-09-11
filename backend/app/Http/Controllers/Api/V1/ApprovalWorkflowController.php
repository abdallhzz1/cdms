<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\ApprovalWorkflow;
use App\Models\AuditLog;
use App\Models\Role;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ApprovalWorkflowController extends Controller
{
    public function index(): JsonResponse
    {
        return ApiResponse::success([
            'workflows' => ApprovalWorkflow::with('steps')->where('code', '!=', 'clinical_assessment')->orderBy('id')->get(),
            'roles' => Role::orderBy('code')->get(['code', 'name_key']),
        ]);
    }

    public function update(Request $request, ApprovalWorkflow $approvalWorkflow): JsonResponse
    {
        $data = $request->validate([
            'is_active' => ['required', 'boolean'],
            'prevent_requester_approval' => ['required', 'boolean'],
            'require_distinct_approvers' => ['required', 'boolean'],
            'steps' => ['required', 'array', 'min:1', 'max:5'],
            'steps.*.name_ar' => ['required', 'string', 'max:255'],
            'steps.*.name_en' => ['required', 'string', 'max:255'],
            'steps.*.role_codes' => ['required', 'array', 'min:1'],
            'steps.*.role_codes.*' => ['required', 'string', Rule::exists('roles', 'code')],
        ]);

        DB::transaction(function () use ($approvalWorkflow, $data, $request) {
            $approvalWorkflow = ApprovalWorkflow::query()->whereKey($approvalWorkflow->id)->lockForUpdate()->firstOrFail();
            if ($approvalWorkflow->requests()->where('status', 'pending')->exists()) {
                throw ValidationException::withMessages(['workflow' => [app()->getLocale() === 'ar'
                    ? 'لا يمكن تغيير المسار وفيه طلبات معلقة. أنجز الطلبات أو أعدها أولاً حفاظاً على سلامة سجل الاعتماد.'
                    : 'The workflow has pending requests. Complete or return them before changing its stages.']]);
            }
            $before = [
                'is_active' => $approvalWorkflow->is_active,
                'prevent_requester_approval' => $approvalWorkflow->prevent_requester_approval,
                'require_distinct_approvers' => $approvalWorkflow->require_distinct_approvers,
                'steps' => $approvalWorkflow->steps()->get(['step_order', 'name_ar', 'name_en', 'role_codes'])->toArray(),
            ];
            $approvalWorkflow->update([
                'is_active' => $data['is_active'],
                'prevent_requester_approval' => $data['prevent_requester_approval'],
                'require_distinct_approvers' => $data['require_distinct_approvers'],
                'updated_by' => $request->user()->id,
            ]);
            $approvalWorkflow->steps()->delete();
            foreach ($data['steps'] as $index => $step) {
                $approvalWorkflow->steps()->create([
                    'step_order' => $index + 1, 'name_ar' => trim($step['name_ar']), 'name_en' => trim($step['name_en']),
                    'role_codes' => array_values(array_unique($step['role_codes'])),
                ]);
            }
            AuditLog::create([
                'user_id' => $request->user()->id,
                'action' => 'approval_workflow.updated',
                'entity_type' => ApprovalWorkflow::class,
                'entity_id' => $approvalWorkflow->id,
                'changes' => ['before' => $before, 'after' => $data],
            ]);
        });

        return ApiResponse::success($approvalWorkflow->fresh('steps'), app()->getLocale() === 'ar' ? 'تم حفظ مسار الاعتماد.' : 'Approval workflow saved.');
    }
}
