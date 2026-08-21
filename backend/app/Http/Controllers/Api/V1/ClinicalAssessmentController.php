<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\ClinicalAssessment;
use App\Services\WorkflowTransitionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ClinicalAssessmentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $items = ClinicalAssessment::with(['student', 'session.trainingSite', 'evaluator'])
            ->when($request->filled('student_id'), fn ($query) => $query->where('student_id', $request->integer('student_id')))
            ->latest()
            ->paginate($request->integer('per_page', 25));

        return ApiResponse::success($items->items(), null, ['current_page' => $items->currentPage(), 'last_page' => $items->lastPage(), 'total' => $items->total()]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'student_id' => ['required', 'exists:students,id'],
            'clinical_session_id' => ['nullable', 'exists:clinical_sessions,id'],
            'evaluator_person_id' => ['nullable', 'exists:people,id'],
            'score' => ['nullable', 'numeric', 'min:0'],
            'max_score' => ['required', 'numeric', 'gt:0'],
            'notes' => ['nullable', 'string', 'max:3000'],
        ]);

        if (isset($data['score']) && $data['score'] > $data['max_score']) {
            return ApiResponse::error('Score cannot exceed maximum score.', ['score' => ['Score cannot exceed maximum score.']], [], 422);
        }

        $assessment = ClinicalAssessment::create($data + ['status' => 'submitted']);

        return ApiResponse::success($assessment, 'Clinical assessment submitted successfully.', [], 201);
    }

    public function submit(ClinicalAssessment $clinicalAssessment, WorkflowTransitionService $workflow): JsonResponse
    {
        $workflow->transition($clinicalAssessment, 'submitted');
        return ApiResponse::success($clinicalAssessment->fresh(), 'Assessment submitted.');
    }

    public function returnAssessment(Request $request, ClinicalAssessment $clinicalAssessment, WorkflowTransitionService $workflow): JsonResponse
    {
        $data = $request->validate(['reason' => ['nullable', 'string']]);
        $workflow->transition($clinicalAssessment, 'returned', $data['reason'] ?? null);
        return ApiResponse::success($clinicalAssessment->fresh(), 'Assessment returned.');
    }
}
