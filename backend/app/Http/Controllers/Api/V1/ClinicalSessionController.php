<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\ClinicalSession;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use App\Traits\ScopesByDepartmentAndLevel;

class ClinicalSessionController extends Controller
{
    use ScopesByDepartmentAndLevel;

    public function index(Request $request): JsonResponse
    {
        $query = ClinicalSession::with(['trainingSite', 'rotationBlock.rotation.course']);
        $departmentId = $this->getUserDepartmentId();
        if ($departmentId) {
            $query->whereHas('rotationBlock', fn ($block) => $block->where('department_id', $departmentId));
        }

        $sessions = $query
            ->when($request->filled('date'), fn ($query) => $query->whereDate('session_date', $request->string('date')))
            ->orderByDesc('session_date')
            ->paginate($request->integer('per_page', 25));

        return ApiResponse::success($sessions->items(), null, [
            'current_page' => $sessions->currentPage(),
            'last_page' => $sessions->lastPage(),
            'total' => $sessions->total(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $roles = $request->user()?->roles()->pluck('code') ?? collect();
        $isSupervisorOnly = $roles->contains('CLINICAL_SUPERVISOR')
            && ! $roles->intersect(['SYS_ADMIN', 'CLINICAL_DIRECTOR', 'DEPARTMENT_HEAD', 'DEAN', 'VICE_DEAN'])->count();
        abort_if($isSupervisorOnly, 403, 'Clinical supervisors create attendance sessions from their personal workspace.');

        $data = $request->validate([
            'rotation_block_id' => ['nullable', 'exists:rotation_blocks,id'],
            'training_site_id' => ['nullable', 'exists:training_sites,id'],
            'session_date' => ['required', 'date'],
            'title' => ['required', 'string', 'max:255'],
        ]);

        return ApiResponse::success(ClinicalSession::create($data), 'Clinical session created.', [], 201);
    }
}
