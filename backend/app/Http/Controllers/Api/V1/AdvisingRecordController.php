<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AdvisingRecord;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AdvisingRecordController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $items = AdvisingRecord::with(['student', 'advisor'])
            ->when($request->filled('student_id'), fn ($query) => $query->where('student_id', $request->integer('student_id')))
            ->latest('meeting_date')->paginate($request->integer('per_page', 25));
        return ApiResponse::success($items->items(), null, ['current_page' => $items->currentPage(), 'last_page' => $items->lastPage(), 'total' => $items->total()]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'student_id' => ['required', 'exists:students,id'], 'advisor_person_id' => ['nullable', 'exists:people,id'],
            'meeting_date' => ['required', 'date'], 'category' => ['required', Rule::in(['general', 'academic', 'risk'])],
            'notes' => ['required', 'string', 'max:5000'], 'action_plan' => ['nullable', 'string', 'max:5000'],
        ]);
        return ApiResponse::success(AdvisingRecord::create($data), 'Advising record created.', [], 201);
    }

    public function update(Request $request, AdvisingRecord $advisingRecord): JsonResponse
    {
        $data = $request->validate(['notes' => ['sometimes', 'string', 'max:5000'], 'action_plan' => ['nullable', 'string', 'max:5000'], 'status' => ['sometimes', Rule::in(['open', 'closed'])]]);
        $advisingRecord->update($data);
        return ApiResponse::success($advisingRecord->fresh());
    }
    public function show(AdvisingRecord $advisingRecord): JsonResponse { return ApiResponse::success($advisingRecord->load(['student','advisor','participants.student'])); }
}
