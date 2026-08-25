<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\ClinicalAssessment;
use App\Services\WorkflowTransitionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Facades\DB;

class ClinicalAssessmentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = ClinicalAssessment::with(['student', 'session.trainingSite', 'session.rotationBlock.rotation.course', 'evaluator', 'workflowTransitions.user']);
        $user = $request->user();
        if ($user?->hasRole('CLINICAL_SUPERVISOR') && ! Gate::forUser($user)->allows('permission', ['assessment.approve'])) {
            $personId = $user->person?->id;
            $query->where('evaluator_person_id', $personId ?: 0);
        }

        $items = $query
            ->when($request->filled('student_id'), fn ($query) => $query->where('student_id', $request->integer('student_id')))
            ->when($request->filled('status'), fn ($query) => $query->where('status', $request->string('status')))
            ->latest()
            ->paginate($request->integer('per_page', 25));

        $items->getCollection()->transform(function (ClinicalAssessment $assessment) {
            $assessment->setAttribute('return_reason', $assessment->workflowTransitions->firstWhere('to_state', 'returned')?->reason);
            return $assessment;
        });

        return ApiResponse::success($items->items(), null, ['current_page' => $items->currentPage(), 'last_page' => $items->lastPage(), 'total' => $items->total()]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        $roles = $user?->roles()->pluck('code') ?? collect();
        $isSupervisorOnly = $roles->contains('CLINICAL_SUPERVISOR')
            && ! $roles->intersect(['SYS_ADMIN', 'CLINICAL_DIRECTOR', 'DEPARTMENT_HEAD', 'DEAN', 'VICE_DEAN'])->count();
        abort_if($isSupervisorOnly, 403, 'Clinical supervisors submit assessments from their personal workspace.');

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

        $assessment = ClinicalAssessment::create($data + ['status' => 'draft']);

        return ApiResponse::success($assessment, 'Clinical assessment draft created.', [], 201);
    }

    public function submit(ClinicalAssessment $clinicalAssessment, WorkflowTransitionService $workflow): JsonResponse
    {
        $user = auth()->user();
        if ($user?->hasRole('CLINICAL_SUPERVISOR')) {
            abort_unless($user->person && (int) $clinicalAssessment->evaluator_person_id === (int) $user->person->id, 403, 'You may only submit your own clinical assessments.');
        }
        if ($clinicalAssessment->score === null || ! $clinicalAssessment->evaluator_person_id || ! $clinicalAssessment->clinical_session_id) {
            throw ValidationException::withMessages(['assessment' => ['A score, evaluator, and clinical session are required before submission.']]);
        }
        $workflow->transition($clinicalAssessment, 'submitted');
        $clinicalAssessment->newQuery()->whereKey($clinicalAssessment->id)->update(['submitted_at' => now()]);
        return ApiResponse::success($clinicalAssessment->fresh(), 'Assessment submitted.');
    }

    public function returnAssessment(Request $request, ClinicalAssessment $clinicalAssessment, WorkflowTransitionService $workflow): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:3', 'max:2000']]);
        $this->preventSelfApproval($request, $clinicalAssessment);
        $workflow->transition($clinicalAssessment, 'returned', $data['reason']);
        return ApiResponse::success($clinicalAssessment->fresh(), 'Assessment returned.');
    }

    public function approve(ClinicalAssessment $clinicalAssessment, WorkflowTransitionService $workflow): JsonResponse
    {
        $this->preventSelfApproval(request(), $clinicalAssessment);
        $clinicalAssessment->loadMissing('session.rotationBlock.rotation');
        if ($clinicalAssessment->score === null || ! $clinicalAssessment->evaluator_person_id || ! $clinicalAssessment->session?->rotationBlock?->rotation?->course_id) {
            throw ValidationException::withMessages(['assessment' => ['Only complete assessments linked to a clinical course can be approved.']]);
        }
        $workflow->transition($clinicalAssessment, 'approved');
        return ApiResponse::success($clinicalAssessment->fresh(), 'Assessment approved.');
    }

    public function approveBatch(Request $request, string $batchUuid, WorkflowTransitionService $workflow): JsonResponse
    {
        $items = ClinicalAssessment::with('session.rotationBlock.rotation')->where('assessment_batch_uuid', $batchUuid)->get();
        abort_if($items->isEmpty(), 404, 'Assessment batch not found.');
        foreach ($items as $assessment) {
            $this->preventSelfApproval($request, $assessment);
            if ($assessment->status !== 'submitted' || $assessment->score === null || ! $assessment->evaluator_person_id || ! $assessment->session?->rotationBlock?->rotation?->course_id) {
                throw ValidationException::withMessages(['batch' => ['Every assessment in the batch must be complete and awaiting review.']]);
            }
        }
        DB::transaction(fn () => $items->each(fn ($assessment) => $workflow->transition($assessment, 'approved')));
        return ApiResponse::success(['batch_uuid' => $batchUuid, 'count' => $items->count()], 'Assessment batch approved.');
    }

    public function returnBatch(Request $request, string $batchUuid, WorkflowTransitionService $workflow): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:3', 'max:2000']]);
        $items = ClinicalAssessment::where('assessment_batch_uuid', $batchUuid)->get();
        abort_if($items->isEmpty(), 404, 'Assessment batch not found.');
        foreach ($items as $assessment) {
            $this->preventSelfApproval($request, $assessment);
            if ($assessment->status !== 'submitted') {
                throw ValidationException::withMessages(['batch' => ['Every assessment in the batch must be awaiting review.']]);
            }
        }
        DB::transaction(fn () => $items->each(fn ($assessment) => $workflow->transition($assessment, 'returned', $data['reason'])));
        return ApiResponse::success(['batch_uuid' => $batchUuid, 'count' => $items->count()], 'Assessment batch returned.');
    }

    private function preventSelfApproval(Request $request, ClinicalAssessment $clinicalAssessment): void
    {
        $personId = $request->user()?->person?->id;
        abort_if($personId && (int) $clinicalAssessment->evaluator_person_id === (int) $personId, 403, 'You cannot approve or return your own clinical assessment.');
    }
}
