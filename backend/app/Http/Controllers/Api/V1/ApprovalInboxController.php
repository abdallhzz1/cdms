<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\ApprovalRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ApprovalInboxController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $roles = $request->user()->roles()->pluck('code')->all();
        $items = ApprovalRequest::query()->with(['workflow.steps', 'requester:id,name', 'actions.actor:id,name', 'actions.step'])
            ->whereHas('workflow', fn ($workflow) => $workflow->where('code', '!=', 'correspondence'))
            ->when($request->query('scope') === 'mine', fn ($q) => $q->where('requested_by', $request->user()->id), function ($q) use ($roles, $request) {
                $q->where('status', 'pending')->whereHas('workflow.steps', fn ($step) => $step
                    ->whereColumn('approval_workflow_steps.step_order', 'approval_requests.current_step_order')
                    ->where(function ($rolesQuery) use ($roles) {
                        foreach ($roles as $role) {
                            $rolesQuery->orWhereJsonContains('role_codes', $role);
                        }
                    }))
                    ->where(function ($eligible) use ($request) {
                        $eligible->whereHas('workflow', fn ($workflow) => $workflow->where('prevent_requester_approval', false))
                            ->orWhere('requested_by', '!=', $request->user()->id);
                    });
            })
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->latest('requested_at')->paginate(min(100, max(1, $request->integer('per_page', 50))));

        return ApiResponse::success($items->items(), null, [
            'current_page' => $items->currentPage(), 'last_page' => $items->lastPage(), 'total' => $items->total(),
        ]);
    }
}
