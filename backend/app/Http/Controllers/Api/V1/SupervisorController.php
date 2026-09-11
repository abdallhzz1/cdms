<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AttendanceRecord;
use App\Models\ClinicalAssessment;
use App\Models\ClinicalAssessmentTemplate;
use App\Models\ClinicalSession;
use App\Models\DistributionVersion;
use App\Models\Person;
use App\Models\StudentClinicalAssignment;
use App\Models\SupervisorStudentNote;
use App\Models\WorkflowTransitionLog;
use App\Services\Distribution\SupervisorReassignmentService;
use App\Services\WorkflowTransitionService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Str;

/**
 * SupervisorController — Phase 5C
 *
 * Exposes two groups of endpoints:
 *
 * 1. POST-PUBLICATION SUPERVISOR MANAGEMENT
 *    PUT /api/v1/operational/assignments/{assignment}/supervisor
 *      - Requires permission:distribution.update
 *      - ONLY modifies supervisor_id on a published assignment.
 *
 * 2. SUPERVISOR PORTAL VIEW
 *    GET /api/v1/operational/my-supervisor-assignments
 *      - Resolves authenticated User -> Person -> supervisor assignments
 *        in the current published distribution.
 *      - Requires permission:distribution.view
 */
class SupervisorController extends Controller
{
    public function __construct(
        private SupervisorReassignmentService $reassignmentService,
    ) {}

    /**
     * PUT /api/v1/operational/assignments/{assignment}/supervisor
     *
     * Post-publication supervisor reassignment.
     * Only supervisor_id may be modified on a published assignment.
     */
    public function reassign(Request $request, StudentClinicalAssignment $assignment): JsonResponse
    {
        $validated = $request->validate([
            'supervisor_id' => ['nullable', 'integer'],
        ]);

        // Resolve the version for this published assignment
        $version = $assignment->distributionVersion;

        if (!$version) {
            return response()->json([
                'success' => false,
                'message' => 'Distribution version not found for this assignment.',
                'errors'  => ['assignment' => ['Assignment does not belong to any distribution version.']],
            ], 404);
        }

        try {
            $updated = $this->reassignmentService->reassign(
                $version,
                $assignment,
                $validated['supervisor_id'] ?? null,
                $request->user()
            );
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Supervisor reassignment failed.',
                'errors'  => $e->errors(),
            ], 422);
        }

        $response = [
            'success' => true,
            'message' => 'Supervisor reassigned successfully.',
            'data'    => $updated,
        ];

        // Surface soft workload warning if present
        $warning = $updated->getAttribute('workload_warning');
        if ($warning) {
            $response['warning'] = $warning;
        }

        return response()->json($response);
    }

    /**
     * GET /api/v1/operational/my-supervisor-assignments
     *
     * Returns the authenticated user's supervisor portal view —
     * all assignments from the current published distribution where
     * the user is the assigned supervisor.
     *
     * Resolves: User -> Person (via people.user_id) -> assigned assignments.
     */
    public function myAssignments(Request $request): JsonResponse
    {
        $user = $request->user();

        // Resolve or auto-link Person record for the authenticated user
        $person = Person::where('user_id', $user->id)->first()
            ?? Person::where('email', $user->email)->first();

        if ($person && !$person->user_id) {
            $person->user_id = $user->id;
            $person->save();
        }

        if (!$person && ($user->hasRole('CLINICAL_SUPERVISOR') || $user->hasRole('RTA'))) {
            $person = Person::firstOrCreate(
                ['user_id' => $user->id],
                [
                    'full_name_ar' => $user->name,
                    'full_name_en' => $user->name,
                    'email'        => $user->email,
                    'is_active'    => true,
                ]
            );
        }

        if (!$person) {
            return response()->json([
                'success' => true,
                'message' => 'Supervisor profile ready.',
                'data'    => [],
                'meta'    => [
                    'person_id'    => null,
                    'full_name_ar' => $user->name,
                    'full_name_en' => $user->name,
                    'total'        => 0,
                    'is_supervisor' => false,
                ],
            ]);
        }

        $assignments = $this->reassignmentService->getSupervisorAssignments($person);

        return response()->json([
            'success' => true,
            'message' => 'Supervisor clinical assignments retrieved successfully.',
            'data'    => $assignments,
            'meta'    => [
                'person_id'    => $person->id,
                'full_name_ar' => $person->full_name_ar ?: $user->name,
                'full_name_en' => $person->full_name_en ?: $user->name,
                'total'        => $assignments->count(),
                'is_supervisor' => true,
            ],
        ]);
    }

    /**
     * GET /api/v1/operational/supervisors/{person}/assignments
     *
     * Administrative view — view any supervisor's current assignments.
     * Requires permission:distribution.view (broader admin permission).
     */
    public function supervisorAssignments(Person $person): JsonResponse
    {
        $assignments = $this->reassignmentService->getSupervisorAssignments($person);

        return response()->json([
            'success' => true,
            'message' => 'Supervisor assignments retrieved successfully.',
            'data'    => $assignments,
            'meta'    => [
                'person_id'    => $person->id,
                'full_name_ar' => $person->full_name_ar,
                'full_name_en' => $person->full_name_en,
                'total'        => $assignments->count(),
                'is_active'    => $person->is_active,
            ],
        ]);
    }

    /** Personal, normalized workspace for users who explicitly hold the clinical-supervisor role. */
    public function workspace(Request $request): JsonResponse
    {
        [$user, $person] = $this->supervisorIdentity($request);
        $person->loadMissing('availabilities');
        $assignments = $this->currentAssignments($person);
        $assignments->each(function (StudentClinicalAssignment $assignment) use ($person): void {
            [$start, $end] = $this->assignmentDateRange($assignment);
            $assignment->setAttribute('session_start_date', $start?->toDateString());
            $assignment->setAttribute('session_end_date', $end?->toDateString());
            $assignment->setAttribute('scheduled_dates', $this->scheduledDates($person, $assignment));
            $assignment->setAttribute('evaluation_weeks', $this->evaluationWeeks($assignment));
        });
        $studentIds = $assignments->pluck('student_id')->unique();
        $blockIds = $assignments->pluck('rotation_block_id')->filter()->unique();

        $attendance = AttendanceRecord::query()
            ->with(['student:id,university_number,full_name_ar,full_name_en', 'session:id,rotation_block_id,training_site_id,session_date,title'])
            ->whereIn('student_id', $studentIds)
            ->when($blockIds->isNotEmpty(), fn ($query) => $query->whereHas('session', fn ($session) => $session->whereIn('rotation_block_id', $blockIds)))
            ->latest('id')->limit(100)->get();

        $assessments = ClinicalAssessment::query()
            ->with(['student:id,university_number,full_name_ar,full_name_en', 'session:id,rotation_block_id,training_site_id,session_date,title', 'template.criteria', 'workflowTransitions'])
            ->where('evaluator_person_id', $person->id)
            ->whereIn('student_id', $studentIds)
            ->latest('id')->limit(100)->get();
        $assessments->each(fn (ClinicalAssessment $assessment) => $assessment->setAttribute(
            'return_reason',
            $assessment->workflowTransitions->firstWhere('to_state', 'returned')?->reason,
        ));
        $studentNotes = SupervisorStudentNote::query()
            ->where('supervisor_person_id', $person->id)
            ->whereIn('student_id', $studentIds)
            ->latest('note_date')->latest('id')->get();

        return ApiResponse::success([
            'supervisor' => [
                'person_id' => $person->id,
                'user_id' => $user->id,
                'full_name_ar' => $person->full_name_ar ?: $user->name,
                'full_name_en' => $person->full_name_en ?: $user->name,
            ],
            'assignments' => $assignments,
            'attendance_records' => $attendance,
            'assessments' => $assessments,
            'student_notes' => $studentNotes,
            'assessment_templates' => ClinicalAssessmentTemplate::query()
                ->where('is_active', true)->with('criteria')->orderByRaw('course_id IS NULL DESC')->get(),
            'schedule_configured' => $person->availabilities()->exists(),
        ]);
    }

    public function storeStudentNote(Request $request): JsonResponse
    {
        [, $person] = $this->supervisorIdentity($request);
        $data = $request->validate([
            'assignment_id' => ['required', 'integer'],
            'student_id' => ['required', 'integer', 'exists:students,id'],
            'note' => ['required', 'string', 'max:5000'],
        ]);
        $assignment = $this->ownedCurrentAssignment($person, (int) $data['assignment_id']);
        $noteDate = now()->toDateString();
        $studentAssignment = $this->assignmentGroupQuery($assignment)->where('student_id', $data['student_id'])->first();
        abort_unless($studentAssignment, 403, 'You may only add private notes for students assigned to you.');

        $note = SupervisorStudentNote::create([
            'supervisor_person_id' => $person->id,
            'student_id' => $data['student_id'],
            'student_clinical_assignment_id' => $studentAssignment->id,
            'rotation_block_id' => $assignment->rotation_block_id,
            'training_site_id' => $assignment->training_site_id,
            'note_date' => $noteDate,
            'note' => trim($data['note']),
        ]);

        return ApiResponse::success($note, 'Private supervisor note saved.', [], 201);
    }

    public function updateStudentNote(Request $request, SupervisorStudentNote $note): JsonResponse
    {
        [, $person] = $this->supervisorIdentity($request);
        abort_unless((int) $note->supervisor_person_id === (int) $person->id, 404);
        $data = $request->validate(['note' => ['required', 'string', 'max:5000']]);
        if ($note->student_clinical_assignment_id) {
            $this->ownedCurrentAssignment($person, (int) $note->student_clinical_assignment_id);
        }
        $note->update(['note' => trim($data['note'])]);
        return ApiResponse::success($note->fresh(), 'Private supervisor note updated.');
    }

    public function destroyStudentNote(Request $request, SupervisorStudentNote $note): JsonResponse
    {
        [, $person] = $this->supervisorIdentity($request);
        abort_unless((int) $note->supervisor_person_id === (int) $person->id, 404);
        $note->delete();
        return ApiResponse::success(null, 'Private supervisor note deleted.');
    }

    public function recordAttendance(Request $request): JsonResponse
    {
        [, $person] = $this->supervisorIdentity($request);
        $data = $request->validate([
            'assignment_id' => ['required', 'integer'],
            'session_date' => ['required', 'date'],
            'records' => ['required', 'array', 'min:1'],
            'records.*.student_id' => ['required', 'integer', 'exists:students,id'],
            'records.*.status' => ['required', Rule::in(AttendanceRecord::STATUSES)],
            'records.*.excuse_note' => ['nullable', 'string', 'max:2000'],
        ]);

        $assignment = $this->ownedCurrentAssignment($person, (int) $data['assignment_id']);
        $allowedStudentIds = $this->assignmentGroupQuery($assignment)->pluck('student_id')->map(fn ($id) => (int) $id);
        $requestedStudentIds = collect($data['records'])->pluck('student_id')->map(fn ($id) => (int) $id);
        abort_if($requestedStudentIds->diff($allowedStudentIds)->isNotEmpty(), 403, 'You may only record attendance for students assigned to you.');
        $this->ensureScheduledSession($person, $assignment, $data['session_date']);

        $session = DB::transaction(function () use ($assignment, $data) {
            $session = $this->resolveSession($assignment, $data['session_date']);
            foreach ($data['records'] as $record) {
                AttendanceRecord::updateOrCreate(
                    ['clinical_session_id' => $session->id, 'student_id' => $record['student_id']],
                    [
                        'status' => $record['status'],
                        'excuse_note' => $record['excuse_note'] ?? null,
                        'recorded_by_user_id' => auth()->id(),
                    ],
                );
            }
            return $session;
        });

        return ApiResponse::success(['session_id' => $session->id], 'Attendance saved successfully.');
    }

    public function storeAssessment(Request $request, WorkflowTransitionService $workflow): JsonResponse
    {
        [, $person] = $this->supervisorIdentity($request);
        $data = $request->validate([
            'assignment_id' => ['required', 'integer'],
            'student_id' => ['required', 'integer', 'exists:students,id'],
            'evaluation_week' => ['required', 'integer', 'min:1'],
            'template_id' => ['required', 'integer', 'exists:clinical_assessment_templates,id'],
            'score' => ['required', 'numeric', 'min:0', 'max:10'],
            'notes' => ['nullable', 'string', 'max:3000'],
        ]);
        $assignment = $this->ownedCurrentAssignment($person, (int) $data['assignment_id']);
        $studentAssignment = $this->assignmentGroupQuery($assignment)->where('student_id', $data['student_id'])->first();
        abort_unless($studentAssignment, 403, 'You may only assess students assigned to you.');
        [$weekStart, $weekEnd] = $this->assignmentWeek($assignment, (int) $data['evaluation_week']);
        [$template, $snapshot, $score] = $this->validatedTotalScore($studentAssignment, (int) $data['template_id'], $data['score']);

        $assessment = DB::transaction(fn () => $this->persistWeeklyAssessment(
            $studentAssignment, $person, $template, (int) $data['evaluation_week'], $weekStart, $weekEnd,
            $snapshot, $score, $data['notes'] ?? null, (string) Str::uuid(), $workflow,
        ));

        return ApiResponse::success($assessment->load('student', 'session', 'template.criteria'), 'Clinical assessment saved successfully.');
    }

    public function storeAssessmentBatch(Request $request, WorkflowTransitionService $workflow): JsonResponse
    {
        [, $person] = $this->supervisorIdentity($request);
        $data = $request->validate([
            'assignment_id' => ['required', 'integer'],
            'evaluation_week' => ['required', 'integer', 'min:1'],
            'template_id' => ['required', 'integer', 'exists:clinical_assessment_templates,id'],
            'assessments' => ['required', 'array', 'min:1'],
            'assessments.*.student_id' => ['required', 'integer', 'distinct', 'exists:students,id'],
            'assessments.*.score' => ['required', 'numeric', 'min:0', 'max:10'],
            'assessments.*.notes' => ['nullable', 'string', 'max:3000'],
        ]);

        $assignment = $this->ownedCurrentAssignment($person, (int) $data['assignment_id']);
        $groupAssignments = $this->assignmentGroupQuery($assignment)->get()->keyBy('student_id');
        $lockedAssignmentIds = ClinicalAssessment::query()
            ->where('evaluator_person_id', $person->id)
            ->where('evaluation_week', (int) $data['evaluation_week'])
            ->whereIn('student_clinical_assignment_id', $groupAssignments->pluck('id'))
            ->whereIn('status', ['submitted', 'approved'])
            ->pluck('student_clinical_assignment_id');
        $allowedIds = $groupAssignments
            ->reject(fn (StudentClinicalAssignment $item) => $lockedAssignmentIds->contains($item->id))
            ->keys()->map(fn ($id) => (int) $id)->sort()->values();
        $submittedIds = collect($data['assessments'])->pluck('student_id')->map(fn ($id) => (int) $id)->sort()->values();
        if ($allowedIds->all() !== $submittedIds->all()) {
            throw ValidationException::withMessages(['assessments' => [app()->getLocale() === 'ar'
                ? 'يجب تقييم كل طالب غير مرسل في المجموعة مرة واحدة، دون إعادة إرسال التقييمات المرسلة أو المعتمدة.'
                : 'Every pending student in the group must be evaluated exactly once; submitted or approved assessments must not be resent.']]);
        }

        [$weekStart, $weekEnd] = $this->assignmentWeek($assignment, (int) $data['evaluation_week']);
        $batchUuid = (string) Str::uuid();
        $items = DB::transaction(function () use ($assignment, $groupAssignments, $data, $person, $workflow, $batchUuid, $weekStart, $weekEnd) {
            return collect($data['assessments'])->map(function (array $row) use ($assignment, $groupAssignments, $data, $person, $workflow, $batchUuid, $weekStart, $weekEnd) {
                $studentAssignment = $groupAssignments->get($row['student_id']);
                [$template, $snapshot, $score] = $this->validatedTotalScore($studentAssignment, (int) $data['template_id'], $row['score']);
                return $this->persistWeeklyAssessment(
                    $studentAssignment, $person, $template, (int) $data['evaluation_week'],
                    $weekStart, $weekEnd, $snapshot, $score, $row['notes'] ?? null, $batchUuid, $workflow,
                );
            });
        });

        return ApiResponse::success(
            ['batch_uuid' => $batchUuid, 'assessments' => $items],
            app()->getLocale() === 'ar'
                ? 'تم إرسال التقييم السريري إلى مساعد البحث والتدريس وإتاحته في كشف العلامات.'
                : 'The clinical assessment was sent to the research and teaching assistant and is now available in the grade sheet.'
        );
    }

    private function persistWeeklyAssessment(
        StudentClinicalAssignment $studentAssignment,
        Person $person,
        ClinicalAssessmentTemplate $template,
        int $week,
        Carbon $weekStart,
        Carbon $weekEnd,
        array $snapshot,
        float $score,
        ?string $notes,
        string $batchUuid,
        WorkflowTransitionService $workflow,
    ): ClinicalAssessment {
        $session = $this->resolveSession($studentAssignment, $weekEnd->toDateString());
        $assessment = ClinicalAssessment::query()
            ->where('student_clinical_assignment_id', $studentAssignment->id)
            ->where('evaluation_week', $week)
            ->where('evaluator_person_id', $person->id)
            ->lockForUpdate()->first();

        if ($assessment && ! in_array($assessment->status, ['draft', 'returned'], true)) {
            throw ValidationException::withMessages(['assessments' => ['يوجد تقييم أسبوعي مرسل أو معتمد مسبقاً لهذا الطالب.']]);
        }

        $values = [
            'student_id' => $studentAssignment->student_id,
            'clinical_session_id' => $session->id,
            'evaluator_person_id' => $person->id,
            'assessment_template_id' => $template->id,
            'student_clinical_assignment_id' => $studentAssignment->id,
            'evaluation_week' => $week,
            'week_start' => $weekStart->toDateString(),
            'week_end' => $weekEnd->toDateString(),
            'assessment_batch_uuid' => $batchUuid,
            'score' => $score,
            'max_score' => $template->total_score,
            'criteria_scores' => $snapshot,
            'notes' => $notes,
            'status' => 'submitted',
            'submitted_at' => now(),
        ];

        if ($assessment) {
            // Keep the current workflow state until the transition service has
            // recorded the returned/draft -> submitted transition. Updating
            // status first makes the service see submitted -> submitted and
            // rejects legitimate resubmissions.
            $assessment->update(collect($values)->except(['status', 'submitted_at'])->all());
            $workflow->transition($assessment->fresh(), 'submitted');
            $assessment->newQuery()->whereKey($assessment->id)->update(['submitted_at' => now()]);
            return $assessment->fresh();
        }

        $assessment = ClinicalAssessment::create($values);
        WorkflowTransitionLog::create([
            'entity_type' => ClinicalAssessment::class,
            'entity_id' => $assessment->id,
            'from_state' => null,
            'to_state' => 'submitted',
            'user_id' => auth()->id(),
        ]);
        return $assessment;
    }

    private function validatedTotalScore(StudentClinicalAssignment $assignment, int $templateId, mixed $rawScore): array
    {
        $assignment->loadMissing('rotationBlock.rotation.course', 'student');
        $courseId = $assignment->rotationBlock?->rotation?->course_id;
        $batchYear = $assignment->student?->batch_year;
        $template = ClinicalAssessmentTemplate::query()->whereKey($templateId)->where('is_active', true)->with('criteria')->firstOrFail();
        $expected = ClinicalAssessmentTemplate::currentForCourse($courseId, $batchYear);
        if (! $expected || (int) $expected->id !== (int) $template->id) {
            throw ValidationException::withMessages(['template_id' => ['نموذج التقييم المحدد ليس النموذج المعتمد لهذا المساق والدفعة. حدّث الصفحة ثم أعد المحاولة.']]);
        }
        $score = round((float) $rawScore, 2);
        if ($score < 0 || $score > (float) $template->total_score) {
            throw ValidationException::withMessages(['score' => ["يجب أن تكون العلامة بين 0 و {$template->total_score}."]]);
        }
        $snapshot = $template->criteria->map(fn ($criterion) => [
                'criterion_id' => $criterion->id,
                'code' => $criterion->code,
                'name_ar' => $criterion->name_ar,
                'name_en' => $criterion->name_en,
                'max_score' => (float) $criterion->max_score,
            ])->values()->all();

        return [$template, $snapshot, $score];
    }

    private function assignmentWeek(StudentClinicalAssignment $assignment, int $week): array
    {
        $assignment->loadMissing('rotationBlock.rotation');
        $block = $assignment->rotationBlock;
        $rotation = $block?->rotation;
        if (! $rotation?->start_date || $week < (int) $block->from_week || $week > (int) $block->to_week) {
            throw ValidationException::withMessages(['evaluation_week' => ['الأسبوع المحدد ليس ضمن فترة تكليف المجموعة.']]);
        }
        $start = Carbon::parse($rotation->start_date)->addWeeks($week - 1)->startOfDay();
        if ($start->isFuture()) {
            throw ValidationException::withMessages(['evaluation_week' => ['لا يمكن رصد تقييم لأسبوع لم يبدأ بعد.']]);
        }
        return [$start, $start->copy()->addDays(6)->endOfDay()];
    }

    private function scheduledDates(Person $person, StudentClinicalAssignment $assignment): array
    {
        [$start, $end] = $this->assignmentDateRange($assignment);
        if (! $start || ! $end || ! $assignment->training_site_id || $person->availabilities->isEmpty()) return [];
        $records = $person->availabilities->filter(fn ($row) =>
            (int) $row->training_site_id === (int) $assignment->training_site_id
            && ($row->status ?: 'work') === 'work'
            && (! $row->available_until || $row->available_until->gte($start))
            && (! $row->available_from || $row->available_from->lte($end))
        );
        $dates = [];
        for ($date = $start->copy()->startOfDay(); $date->lte($end); $date->addDay()) {
            if ($records->contains(fn ($row) =>
                $row->day === strtolower($date->format('l'))
                && (! $row->available_from || $row->available_from->lte($date))
                && (! $row->available_until || $row->available_until->gte($date))
            )) $dates[] = $date->toDateString();
        }
        return $dates;
    }

    private function evaluationWeeks(StudentClinicalAssignment $assignment): array
    {
        $assignment->loadMissing('rotationBlock.rotation');
        $block = $assignment->rotationBlock;
        $rotation = $block?->rotation;
        if (! $rotation?->start_date || ! $block?->from_week || ! $block?->to_week) return [];
        return collect(range((int) $block->from_week, (int) $block->to_week))->map(function (int $week) use ($rotation) {
            $start = Carbon::parse($rotation->start_date)->addWeeks($week - 1);
            return ['number' => $week, 'start_date' => $start->toDateString(), 'end_date' => $start->copy()->addDays(6)->toDateString()];
        })->all();
    }

    private function ensureScheduledSession(Person $person, StudentClinicalAssignment $assignment, string $date): void
    {
        $this->ensureSessionDateWithinAssignment($assignment, $date);
        if (! in_array(Carbon::parse($date)->toDateString(), $this->scheduledDates($person, $assignment), true)) {
            throw ValidationException::withMessages(['session_date' => ['التاريخ المحدد ليس يوم تدريب معتمداً لهذا المشرف في موقع المجموعة.']]);
        }
    }

    private function supervisorIdentity(Request $request): array
    {
        $user = $request->user();
        abort_unless($user && $user->hasRole('CLINICAL_SUPERVISOR'), 403, 'The clinical supervisor role is required.');

        $person = Person::query()->where('user_id', $user->id)->first()
            ?? Person::query()->where('email', $user->email)->whereNull('user_id')->first();

        if (! $person) {
            $person = Person::create([
                'user_id' => $user->id,
                'full_name_ar' => $user->name,
                'full_name_en' => $user->name,
                'email' => $user->email,
                'is_active' => true,
            ]);
        } elseif (! $person->user_id) {
            $person->update(['user_id' => $user->id]);
        }

        return [$user, $person];
    }

    private function currentAssignments(Person $person)
    {
        return StudentClinicalAssignment::query()
            ->where('supervisor_id', $person->id)
            ->whereHas('distributionVersion', fn ($query) => $query->where('status', 'published')->where('is_current', true))
            ->with([
                'student:id,university_number,full_name_ar,full_name_en,academic_level,batch_year,photo_url',
                'studentSubgroup.group',
                'rotationBlock.rotation.academicYear',
                'rotationBlock.rotation.course',
                'rotationBlock.rotation.clinicalPeriod',
                'trainingSite:id,name_ar,name_en',
                'department:id,name_ar,name_en',
                'distributionVersion:id,rotation_id,status,is_current',
            ])->orderBy('rotation_block_id')->orderBy('student_subgroup_id')->orderBy('student_id')->get();
    }

    private function ownedCurrentAssignment(Person $person, int $assignmentId): StudentClinicalAssignment
    {
        return StudentClinicalAssignment::query()
            ->whereKey($assignmentId)->where('supervisor_id', $person->id)
            ->whereHas('distributionVersion', fn ($query) => $query->where('status', 'published')->where('is_current', true))
            ->firstOrFail();
    }

    private function assignmentGroupQuery(StudentClinicalAssignment $assignment)
    {
        $assignment->loadMissing('student:id,batch_year');
        return StudentClinicalAssignment::query()
            ->where('distribution_version_id', $assignment->distribution_version_id)
            ->where('supervisor_id', $assignment->supervisor_id)
            ->where('rotation_block_id', $assignment->rotation_block_id)
            ->where('training_site_id', $assignment->training_site_id)
            ->where('student_subgroup_id', $assignment->student_subgroup_id)
            ->whereHas('student', fn ($query) => $query->where('batch_year', $assignment->student?->batch_year));
    }

    private function resolveSession(StudentClinicalAssignment $assignment, string $date): ClinicalSession
    {
        $session = ClinicalSession::query()
            ->where('rotation_block_id', $assignment->rotation_block_id)
            ->where('training_site_id', $assignment->training_site_id)
            ->whereDate('session_date', $date)->first();

        return $session ?: ClinicalSession::create([
            'rotation_block_id' => $assignment->rotation_block_id,
            'training_site_id' => $assignment->training_site_id,
            'session_date' => $date,
            'title' => 'Clinical training session',
        ]);
    }

    private function ensureSessionDateWithinAssignment(StudentClinicalAssignment $assignment, string $date): void
    {
        [$start, $end] = $this->assignmentDateRange($assignment);
        if (! $start || ! $end) {
            return;
        }
        $selected = Carbon::parse($date);

        if ($selected->lt($start) || $selected->gt($end)) {
            throw ValidationException::withMessages([
                'session_date' => [sprintf(
                    'تاريخ الجلسة يجب أن يكون ضمن فترة تكليف المجموعة من %s إلى %s.',
                    $start->toDateString(),
                    $end->toDateString(),
                )],
            ]);
        }
    }

    /** Authoritative calendar bounds used by both the UI and write validation. */
    private function assignmentDateRange(StudentClinicalAssignment $assignment): array
    {
        $assignment->loadMissing('rotationBlock.rotation');
        $block = $assignment->rotationBlock;
        $rotation = $block?->rotation;
        if (! $rotation?->start_date || ! $block?->from_week || ! $block?->to_week) {
            return [null, null];
        }

        $start = Carbon::parse($rotation->start_date)->addWeeks((int) $block->from_week - 1)->startOfDay();
        $end = Carbon::parse($rotation->start_date)->addWeeks((int) $block->to_week)->subDay()->endOfDay();

        return [$start, $end];
    }
}
