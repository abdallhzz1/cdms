<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\ClinicalSession;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ClinicalSessionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $sessions = ClinicalSession::with('trainingSite')
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
        $data = $request->validate([
            'rotation_block_id' => ['nullable', 'exists:rotation_blocks,id'],
            'training_site_id' => ['nullable', 'exists:training_sites,id'],
            'session_date' => ['required', 'date'],
            'title' => ['required', 'string', 'max:255'],
        ]);

        return ApiResponse::success(ClinicalSession::create($data), 'Clinical session created.', [], 201);
    }
}
