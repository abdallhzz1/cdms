<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\ClinicalAssessment;
use App\Models\ClinicalPeriod;
use App\Models\Student;
use App\Services\WorkflowTransitionService;
use App\Traits\ScopesByDepartmentAndLevel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

class ClinicalAssessmentController extends Controller
{
    use ScopesByDepartmentAndLevel;

    public function index(Request $request): JsonResponse
    {
        $items = $this->scopedQuery($request)
            ->with([
                'student:id,university_number,full_name_ar,full_name_en,photo_url,academic_level',
                'session.trainingSite:id,name_ar,name_en',
                'session.rotationBlock.rotation.course:id,code,name_ar,name_en',
                'session.rotationBlock.rotation.clinicalPeriod:id,academic_year_id,code,name_ar,name_en,sequence',
                'evaluator:id,user_id,full_name_ar,full_name_en,email',
                'workflowTransitions.user:id,name',
            ])
            ->orderByRaw("CASE status WHEN 'submitted' THEN 0 WHEN 'returned' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END")
            ->orderByRaw('COALESCE(submitted_at, created_at) DESC')
            ->paginate(max(1, min(100, $request->integer('per_page', 25))));

        $items->getCollection()->transform(function (ClinicalAssessment $assessment) {
            $assessment->setAttribute('return_reason', $assessment->workflowTransitions->firstWhere('to_state', 'returned')?->reason);

            return $assessment;
        });

        if ($request->boolean('page_payload')) {
            return ApiResponse::success([
                'items' => $items->items(),
                'pagination' => [
                    'current_page' => $items->currentPage(),
                    'last_page' => $items->lastPage(),
                    'total' => $items->total(),
                    'per_page' => $items->perPage(),
                ],
            ]);
        }

        return ApiResponse::success($items->items(), null, ['current_page' => $items->currentPage(), 'last_page' => $items->lastPage(), 'total' => $items->total()]);
    }

    public function summary(Request $request): JsonResponse
    {
        $query = $this->scopedQuery($request, true);
        $statusCounts = (clone $query)
            ->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');
        $average = (clone $query)
            ->where('status', 'approved')
            ->whereNotNull('score')
            ->where('max_score', '>', 0)
            ->selectRaw('ROUND(AVG((score / max_score) * 100), 1) as average_percentage')
            ->value('average_percentage');

        return ApiResponse::success([
            'total' => (clone $query)->count(),
            'submitted' => (int) ($statusCounts['submitted'] ?? 0),
            'returned' => (int) ($statusCounts['returned'] ?? 0),
            'approved' => (int) ($statusCounts['approved'] ?? 0),
            'draft' => (int) ($statusCounts['draft'] ?? 0),
            'batches' => (clone $query)->whereNotNull('assessment_batch_uuid')->distinct()->count('assessment_batch_uuid'),
            'approved_average_percentage' => $average !== null ? (float) $average : null,
            'clinical_periods' => ClinicalPeriod::query()->orderBy('academic_year_id')->orderBy('sequence')->get(['id','academic_year_id','code','name_ar','name_en','sequence']),
        ]);
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

        $this->authorizeStudentAccess(Student::findOrFail($data['student_id']));

        if (isset($data['score']) && $data['score'] > $data['max_score']) {
            return ApiResponse::error('Score cannot exceed maximum score.', ['score' => ['Score cannot exceed maximum score.']], [], 422);
        }

        $assessment = ClinicalAssessment::create($data + ['status' => 'draft']);

        return ApiResponse::success($assessment, 'Clinical assessment draft created.', [], 201);
    }

    public function submit(ClinicalAssessment $clinicalAssessment, WorkflowTransitionService $workflow): JsonResponse
    {
        $this->authorizeAssessmentAccess($clinicalAssessment);
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
        $this->authorizeAssessmentAccess($clinicalAssessment);
        $data = $request->validate(['reason' => ['required', 'string', 'min:3', 'max:2000']]);
        $this->preventSelfApproval($request, $clinicalAssessment);
        $workflow->transition($clinicalAssessment, 'returned', $data['reason']);

        return ApiResponse::success($clinicalAssessment->fresh(), 'Assessment returned.');
    }

    public function approve(ClinicalAssessment $clinicalAssessment, WorkflowTransitionService $workflow): JsonResponse
    {
        $this->authorizeAssessmentAccess($clinicalAssessment);
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
        $allCount = ClinicalAssessment::where('assessment_batch_uuid', $batchUuid)->count();
        $items = $this->scopedQuery($request, false)
            ->with('session.rotationBlock.rotation')
            ->where('assessment_batch_uuid', $batchUuid)
            ->get();
        abort_if($items->isEmpty(), 404, 'Assessment batch not found.');
        abort_if($items->count() !== $allCount, 403, 'This assessment batch is outside your assigned scope.');
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
        $allCount = ClinicalAssessment::where('assessment_batch_uuid', $batchUuid)->count();
        $items = $this->scopedQuery($request, false)->where('assessment_batch_uuid', $batchUuid)->get();
        abort_if($items->isEmpty(), 404, 'Assessment batch not found.');
        abort_if($items->count() !== $allCount, 403, 'This assessment batch is outside your assigned scope.');
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

    private function authorizeAssessmentAccess(ClinicalAssessment $clinicalAssessment): void
    {
        $this->authorizeStudentAccess($clinicalAssessment->student);
    }

    private function scopedQuery(Request $request, bool $applyFilters = true)
    {
        $query = ClinicalAssessment::query()->whereIn(
            'student_id',
            $this->applyStudentAccessScope(Student::query())->select('students.id')
        );

        $user = $request->user();
        if ($user?->hasRole('CLINICAL_SUPERVISOR') && ! Gate::forUser($user)->allows('permission', ['assessment.approve'])) {
            $query->where('evaluator_person_id', $user->person?->id ?: 0);
        }

        if (! $applyFilters) {
            return $query;
        }

        return $query
            ->when($request->filled('student_id'), fn ($builder) => $builder->where('student_id', $request->integer('student_id')))
            ->when($request->filled('status'), fn ($builder) => $builder->where('status', (string) $request->query('status')))
            ->when($request->filled('academic_level'), fn ($builder) => $builder->whereHas('student', fn ($student) => $student->where('academic_level', (string) $request->query('academic_level'))))
            ->when($request->filled('clinical_period_id'), fn ($builder) => $builder->whereHas('session.rotationBlock.rotation', fn ($rotation) => $rotation->where('clinical_period_id', $request->integer('clinical_period_id'))))
            ->when($request->filled('search'), function ($builder) use ($request) {
                $search = trim((string) $request->query('search'));
                $builder->where(function ($nested) use ($search) {
                    $nested->whereHas('student', fn ($student) => $student
                        ->where('university_number', 'like', "%{$search}%")
                        ->orWhere('full_name_ar', 'like', "%{$search}%")
                        ->orWhere('full_name_en', 'like', "%{$search}%"))
                        ->orWhereHas('evaluator', fn ($evaluator) => $evaluator
                            ->where('full_name_ar', 'like', "%{$search}%")
                            ->orWhere('full_name_en', 'like', "%{$search}%"))
                        ->orWhereHas('session.rotationBlock.rotation.course', fn ($course) => $course
                            ->where('code', 'like', "%{$search}%")
                            ->orWhere('name_ar', 'like', "%{$search}%")
                            ->orWhere('name_en', 'like', "%{$search}%"));
                });
            });
    }
}
