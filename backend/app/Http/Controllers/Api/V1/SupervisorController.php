<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AttendanceRecord;
use App\Models\AuditLog;
use App\Models\ClinicalAssessment;
use App\Models\ClinicalAssessmentTemplate;
use App\Models\ClinicalQrAttendanceSession;
use App\Models\ClinicalSession;
use App\Models\GradeEntry;
use App\Models\StudentCourseEnrollment;
use App\Models\DistributionVersion;
use App\Models\Person;
use App\Models\StudentClinicalAssignment;
use App\Models\SupervisorStudentNote;
use App\Models\WorkflowTransitionLog;
use App\Services\Distribution\SupervisorReassignmentService;
use App\Services\SupervisorWorkScheduleService;
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
        private SupervisorWorkScheduleService $workScheduleService,
    ) {}

    /**
     * PUT /api/v1/operational/assignments/{assignment}/supervisor
     *
     * Post-publication supervisor reassignment.
     * Only supervisor_id may be modified on a published assignment.
     */
    public function reassign(Request $request, StudentClinicalAssignment $assignment): JsonResponse
    {
        $scope = app(\App\Services\DepartmentHeadCourseScope::class);
        $scope->authorizeRecord($scope->assignments(StudentClinicalAssignment::query()), $assignment->id);
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
        $assignments = $this->reassignmentService->getSupervisorAssignments($person, true);

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
        $miniOsce = DB::table('clinical_mini_osce_scores')
            ->whereIn('student_id', $studentIds)
            ->whereIn('rotation_block_id', $blockIds)
            ->get(['student_id', 'rotation_block_id', 'score', 'max_score']);

        return ApiResponse::success([
            'supervisor' => [
                'person_id' => $person->id,
                'user_id' => $user->id,
                'full_name_ar' => $person->full_name_ar ?: $user->name,
                'full_name_en' => $person->full_name_en ?: $user->name,
            ],
            'assignments' => $assignments,
            'work_schedules' => $this->workScheduleService->schedules($person),
            'attendance_records' => $attendance,
            'assessments' => $assessments,
            'student_notes' => $studentNotes,
            'mini_osce_scores' => $miniOsce,
            'assessment_templates' => ClinicalAssessmentTemplate::query()
                ->where('is_active', true)->with('criteria')->orderByRaw('course_id IS NULL DESC')->get(),
            'schedule_configured' => $person->availabilities()->exists(),
        ]);
    }

    /** The complete official register for one of this supervisor's scheduled groups. */
    public function attendanceDay(Request $request): JsonResponse
    {
        [, $person] = $this->supervisorIdentity($request);
        $data = $request->validate([
            'assignment_id' => ['required', 'integer'],
            'session_date' => ['required', 'date_format:Y-m-d'],
        ]);
        $assignment = $this->ownedCurrentAssignment($person, (int) $data['assignment_id']);
        $this->ensureScheduledSession($person, $assignment, $data['session_date']);
        $studentIds = $this->assignmentGroupQuery($assignment)->pluck('student_id');
        $session = ClinicalSession::query()
            ->where('rotation_block_id', $assignment->rotation_block_id)
            ->where('training_site_id', $assignment->training_site_id)
            ->whereDate('session_date', $data['session_date'])->first();
        $records = $session
            ? AttendanceRecord::query()->where('clinical_session_id', $session->id)
                ->whereIn('student_id', $studentIds)->get(['id', 'student_id', 'status', 'excuse_note', 'recording_source', 'recorded_by_user_id', 'updated_at'])
            : collect();
        $qr = $this->attendanceQrSession($assignment, $data['session_date']);

        return ApiResponse::success([
            'records' => $records,
            'qr_session' => $qr ? ['id' => $qr->id, 'state' => $qr->state] : null,
        ]);
    }

    /** Manual entry is the primary workflow; QR sessions are mutually exclusive for the same group/day. */
    public function recordAttendance(Request $request): JsonResponse
    {
        [$user, $person] = $this->supervisorIdentity($request);
        $data = $request->validate([
            'assignment_id' => ['required', 'integer'],
            'session_date' => ['required', 'date_format:Y-m-d', 'before_or_equal:today'],
            'records' => ['required', 'array', 'min:1', 'max:250'],
            'records.*.student_id' => ['required', 'integer', 'distinct', 'exists:students,id'],
            'records.*.status' => ['required', Rule::in(AttendanceRecord::STATUSES)],
            'records.*.excuse_note' => ['nullable', 'string', 'max:2000'],
        ]);
        $assignment = $this->ownedCurrentAssignment($person, (int) $data['assignment_id']);
        $this->ensureScheduledSession($person, $assignment, $data['session_date']);
        foreach ($data['records'] as $index => $row) {
            if ($row['status'] === 'excused' && ! filled(trim((string) ($row['excuse_note'] ?? '')))) {
                throw ValidationException::withMessages(["records.$index.excuse_note" => ['سبب العذر مطلوب عند اختيار «بعذر».']]);
            }
        }

        $result = DB::transaction(function () use ($assignment, $data, $user) {
            // QR opening takes the same group lock. Only one method can claim this group/day.
            $groupAssignments = $this->assignmentGroupQuery($assignment)->orderBy('id')->lockForUpdate()->get();
            $allowed = $groupAssignments->pluck('student_id')->map(fn ($id) => (int) $id)->sort()->values()->all();
            $submitted = collect($data['records'])->pluck('student_id')->map(fn ($id) => (int) $id)->sort()->values()->all();
            if ($allowed !== $submitted) {
                throw ValidationException::withMessages(['records' => ['يجب تحديد حالة لكل طالب في المجموعة مرة واحدة قبل الحفظ.']]);
            }
            abort_if($this->attendanceQrSession($assignment, $data['session_date']), 409, 'توجد جلسة QR لهذه المجموعة واليوم؛ راجع نتائجها من شاشة QR.');

            $session = $this->resolveSession($assignment, $data['session_date']);
            $existing = AttendanceRecord::query()->where('clinical_session_id', $session->id)
                ->whereIn('student_id', $allowed)->lockForUpdate()->get()->keyBy('student_id');
            abort_if($existing->contains(fn (AttendanceRecord $record) => $record->clinical_qr_attendance_roster_id !== null), 409, 'لا يمكن استبدال سجلات QR بالتسجيل اليدوي.');

            foreach ($data['records'] as $row) {
                $before = $existing->get((int) $row['student_id']);
                $note = trim((string) ($row['excuse_note'] ?? '')) ?: null;
                $record = AttendanceRecord::updateOrCreate(
                    ['clinical_session_id' => $session->id, 'student_id' => (int) $row['student_id']],
                    [
                        'status' => $row['status'],
                        'excuse_note' => $note,
                        'recording_source' => 'manual',
                        'recorded_by_user_id' => $user->id,
                    ],
                );
                if (! $before || $before->status !== $row['status'] || $before->excuse_note !== $note) {
                    AuditLog::create([
                        'user_id' => $user->id,
                        'action' => 'clinical_attendance.manual_recorded',
                        'entity_type' => AttendanceRecord::class,
                        'entity_id' => $record->id,
                        'student_id' => (int) $row['student_id'],
                        'changes' => [
                            'previous_status' => $before?->status,
                            'status' => $row['status'],
                            'previous_note' => $before?->excuse_note,
                            'note' => $note,
                            'session_date' => $data['session_date'],
                        ],
                    ]);
                }
            }
            return $session;
        });

        return ApiResponse::success(['session_id' => $result->id], 'تم حفظ حضور المجموعة وملاحظاتها في السجل الرسمي.');
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

    public function storeAssessment(Request $request, WorkflowTransitionService $workflow): JsonResponse
    {
        [, $person] = $this->supervisorIdentity($request);
        $data = $request->validate([
            'assignment_id' => ['required', 'integer'],
            'student_id' => ['required', 'integer', 'exists:students,id'],
            'evaluation_week' => ['nullable', 'integer', 'min:1'],
            'template_id' => ['required', 'integer', 'exists:clinical_assessment_templates,id'],
            'score' => ['required', 'numeric', 'min:0'],
            'notes' => ['nullable', 'string', 'max:3000'],
        ]);
        $assignment = $this->ownedCurrentAssignment($person, (int) $data['assignment_id']);
        $studentAssignment = $this->assignmentGroupQuery($assignment)->where('student_id', $data['student_id'])->first();
        abort_unless($studentAssignment, 403, 'You may only assess students assigned to you.');
        $kind = $this->assessmentKind($assignment, $data['evaluation_week'] ?? null);
        $week = $kind === 'weekly' ? (int) $data['evaluation_week'] : null;
        [$weekStart, $weekEnd] = $kind === 'weekly' ? $this->assignmentWeek($assignment, $week) : $this->assignmentPeriod($assignment);
        [$template, $snapshot, $score, $entryMax] = $this->validatedTotalScore($studentAssignment, (int) $data['template_id'], $data['score'], $week, $person->id, $kind);

        $assessment = DB::transaction(fn () => $this->persistWeeklyAssessment(
            $studentAssignment, $person, $template, $week, $weekStart, $weekEnd,
            $snapshot, $score, $entryMax, $data['notes'] ?? null, (string) Str::uuid(), $workflow, $kind,
        ));

        return ApiResponse::success($assessment->load('student', 'session', 'template.criteria'), 'Clinical assessment saved successfully.');
    }

    public function storeAssessmentBatch(Request $request, WorkflowTransitionService $workflow): JsonResponse
    {
        [, $person] = $this->supervisorIdentity($request);
        $data = $request->validate([
            'assignment_id' => ['required', 'integer'],
            'evaluation_week' => ['nullable', 'integer', 'min:1'],
            'template_id' => ['required', 'integer', 'exists:clinical_assessment_templates,id'],
            'assessments' => ['required', 'array', 'min:1'],
            'assessments.*.student_id' => ['required', 'integer', 'distinct', 'exists:students,id'],
            'assessments.*.score' => ['required', 'numeric', 'min:0'],
            'assessments.*.notes' => ['nullable', 'string', 'max:3000'],
        ]);

        $assignment = $this->ownedCurrentAssignment($person, (int) $data['assignment_id']);
        $kind = $this->assessmentKind($assignment, $data['evaluation_week'] ?? null);
        $week = $kind === 'weekly' ? (int) $data['evaluation_week'] : null;
        $groupAssignments = $this->assignmentGroupQuery($assignment)->get()->keyBy('student_id');
        $lockedAssignmentIds = ClinicalAssessment::query()
            ->where('evaluator_person_id', $person->id)
            ->where('assessment_kind', $kind)
            ->where('evaluation_week', $week)
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

        [$weekStart, $weekEnd] = $kind === 'weekly' ? $this->assignmentWeek($assignment, $week) : $this->assignmentPeriod($assignment);
        $batchUuid = (string) Str::uuid();
        $items = DB::transaction(function () use ($assignment, $groupAssignments, $data, $person, $workflow, $batchUuid, $weekStart, $weekEnd, $kind, $week) {
            return collect($data['assessments'])->map(function (array $row) use ($assignment, $groupAssignments, $data, $person, $workflow, $batchUuid, $weekStart, $weekEnd, $kind, $week) {
                $studentAssignment = $groupAssignments->get($row['student_id']);
                [$template, $snapshot, $score, $entryMax] = $this->validatedTotalScore($studentAssignment, (int) $data['template_id'], $row['score'], $week, $person->id, $kind);
                return $this->persistWeeklyAssessment(
                    $studentAssignment, $person, $template, $week,
                    $weekStart, $weekEnd, $snapshot, $score, $entryMax, $row['notes'] ?? null, $batchUuid, $workflow, $kind,
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

    public function recordMiniOsce(Request $request): JsonResponse
    {
        [, $person] = $this->supervisorIdentity($request);
        $data = $request->validate([
            'assignment_id' => ['required', 'integer'],
            'student_id' => ['required', 'integer', 'exists:students,id'],
            'score' => ['required', 'numeric', 'min:0'],
        ]);
        $assignment = $this->ownedCurrentAssignment($person, (int) $data['assignment_id']);
        abort_unless($assignment->rotation_block_id && $this->assignmentGroupQuery($assignment)
            ->where('student_id', $data['student_id'])->exists(), 403);
        $assignment->loadMissing('rotationBlock.rotation.course.assessmentComponents');
        $rotation = $assignment->rotationBlock?->rotation;
        $course = $rotation?->course;
        $max = (float) ($course?->assessmentComponents?->firstWhere('code', 'clinical')?->mini_osce_max_score ?? 0);
        if ($max <= 0 || (float) $data['score'] > $max) {
            throw ValidationException::withMessages(['score' => ["علامة الميني أوسكي يجب أن تكون بين 0 و {$max}."]]);
        }
        $this->assignmentPeriod($assignment);
        DB::transaction(function () use ($data, $assignment, $person, $course, $rotation, $max) {
            $locked = GradeEntry::query()->whereHas('enrollment', fn ($query) => $query
                ->where('student_id', $data['student_id'])->where('course_id', $course->id)
                ->where('academic_year_id', $rotation->academic_year_id))
                ->whereIn('status', ['submitted', 'approved', 'published', 'locked'])->exists();
            if ($locked) throw ValidationException::withMessages(['score' => ['لا يمكن تعديل الميني أوسكي بعد إرسال كشف العلامات.']]);
            $key = ['student_id' => $data['student_id'], 'rotation_block_id' => $assignment->rotation_block_id];
            $old = DB::table('clinical_mini_osce_scores')->where($key)->lockForUpdate()->first();
            if ($old && (float) $data['score'] > (float) $old->max_score) {
                throw ValidationException::withMessages(['score' => ['العلامة تتجاوز سقف الميني أوسكي المحفوظ لهذه الفترة.']]);
            }
            DB::table('clinical_mini_osce_scores')->updateOrInsert($key, [
                'entered_by_person_id' => $person->id,
                'score' => round((float) $data['score'], 2),
                'max_score' => $old?->max_score ?? $max,
                'created_at' => $old?->created_at ?? now(),
                'updated_at' => now(),
            ]);
            AuditLog::create([
                'user_id' => auth()->id(), 'action' => 'grade.mini_osce.recorded',
                'entity_type' => \App\Models\Course::class, 'entity_id' => $course->id,
                'changes' => ['student_id' => $data['student_id'], 'rotation_block_id' => $assignment->rotation_block_id,
                    'previous' => $old?->score, 'current' => round((float) $data['score'], 2)],
            ]);
        });

        return ApiResponse::success(['score' => round((float) $data['score'], 2), 'max_score' => $max]);
    }

    /** A final OSCE mark belongs to a course/year grade entry, never to a weekly assessment. */
    public function osceGroups(Request $request): JsonResponse
    {
        [, $person] = $this->supervisorIdentity($request);
        $assignments = StudentClinicalAssignment::query()
            ->where('supervisor_id', $person->id)
            ->whereHas('distributionVersion', fn ($query) => $query->where('status', 'published')->where('is_current', true))
            ->with([
                'student:id,university_number,full_name_ar,full_name_en,batch_year,photo_url',
                'studentSubgroup.group', 'rotationBlock.rotation.academicYear',
                'rotationBlock.rotation.course.assessmentComponents', 'trainingSite:id,name_ar,name_en',
            ])->orderByDesc('id')->get()->filter(function (StudentClinicalAssignment $assignment) {
                $osce = $assignment->rotationBlock?->rotation?->course?->assessmentComponents?->firstWhere('code', 'osce');
                return $osce && (float) $osce->max_score > 0 && $osce->osce_entry_mode !== 'assistant';
            })->values();

        return ApiResponse::success(['assignments' => $assignments]);
    }

    public function osceRoster(Request $request): JsonResponse
    {
        [, $person] = $this->supervisorIdentity($request);
        $data = $request->validate(['assignment_id' => ['required', 'integer']]);
        $assignment = $this->ownedPublishedAssignment($person, (int) $data['assignment_id']);
        [$course, $yearId, $maxScore] = $this->osceContext($assignment);
        $students = $this->osceAssignmentGroupQuery($assignment, $course->id, $yearId)
            ->with('student:id,university_number,full_name_ar,full_name_en,photo_url')
            ->orderBy('student_id')->get()->pluck('student')->filter()->unique('id')->values();
        $entries = GradeEntry::query()->with('enrollment:id,student_id,course_id,academic_year_id')
            ->whereHas('enrollment', fn ($query) => $query->where('course_id', $course->id)
                ->where('academic_year_id', $yearId)->whereIn('student_id', $students->pluck('id')))
            ->get()->keyBy(fn (GradeEntry $entry) => $entry->enrollment->student_id);

        return ApiResponse::success([
            'course' => $course->only(['id', 'code', 'name_ar', 'name_en']),
            'academic_year_id' => $yearId,
            'max_score' => $maxScore,
            'entry_mode' => $course->assessmentComponents->firstWhere('code', 'osce')?->osce_entry_mode ?: 'legacy_shared',
            'students' => $students->map(fn ($student) => [
                'student' => $student,
                'osce_score' => $entries->get($student->id)?->osce_score,
                'grade_status' => $entries->get($student->id)?->status,
            ])->values(),
        ]);
    }

    public function recordOsce(Request $request): JsonResponse
    {
        [, $person] = $this->supervisorIdentity($request);
        $data = $request->validate([
            'assignment_id' => ['required', 'integer'],
            'student_id' => ['required', 'integer', 'exists:students,id'],
            'osce_score' => ['required', 'numeric', 'min:0'],
        ]);
        $assignment = $this->ownedPublishedAssignment($person, (int) $data['assignment_id']);
        [$course, $yearId, $maxScore] = $this->osceContext($assignment);
        abort_unless($this->osceAssignmentGroupQuery($assignment, $course->id, $yearId)
            ->where('student_id', $data['student_id'])->exists(), 403);
        if ((float) $data['osce_score'] > $maxScore) {
            throw ValidationException::withMessages(['osce_score' => ["علامة OSCE لهذا المساق يجب أن تكون من 0 إلى {$maxScore}."]]);
        }

        $grade = DB::transaction(function () use ($course, $yearId, $data, $person) {
            $enrollment = StudentCourseEnrollment::firstOrCreate(
                ['student_id' => $data['student_id'], 'course_id' => $course->id, 'academic_year_id' => $yearId, 'semester' => 'FIRST'],
                ['status' => 'enrolled'],
            );
            $grade = GradeEntry::query()->where('student_course_enrollment_id', $enrollment->id)->lockForUpdate()->first();
            if ($grade && in_array($grade->status, ['submitted', 'approved', 'published', 'locked'], true)) {
                throw ValidationException::withMessages(['osce_score' => ['لا يمكن تغيير OSCE بعد إرسال كشف العلامات أو اعتماده.']]);
            }

            $old = $grade?->osce_score;
            $osce = round((float) $data['osce_score'], 2);
            $grade ??= new GradeEntry(['student_course_enrollment_id' => $enrollment->id, 'max_score' => 100, 'status' => 'draft', 'prepared_by_user_id' => auth()->id()]);
            $grade->osce_score = $osce;
            $mode = $course->assessmentComponents->firstWhere('code', 'osce')?->osce_entry_mode;
            $committee = $mode === 'committee'
                ? Person::query()->whereIn('id', StudentClinicalAssignment::query()
                    ->where('student_id', $data['student_id'])
                    ->whereHas('distributionVersion', fn ($query) => $query->where('status', 'published')->where('is_current', true))
                    ->whereHas('rotationBlock.rotation', fn ($query) => $query->where('course_id', $course->id)->where('academic_year_id', $yearId))
                    ->whereNotNull('supervisor_id')->distinct()->pluck('supervisor_id'))
                    ->get(['id', 'full_name_ar', 'full_name_en'])->toArray()
                : null;
            $grade->osce_recorded_by_user_id = auth()->id();
            $grade->osce_committee_snapshot = $committee;
            $grade->score = $grade->clinical_score !== null && $grade->written_score !== null
                ? round((float) $grade->clinical_score + $osce + (float) $grade->written_score, 2)
                : null;
            $grade->save();
            AuditLog::create([
                'user_id' => auth()->id(), 'action' => 'grade.osce.recorded',
                'entity_type' => GradeEntry::class, 'entity_id' => $grade->id,
                'changes' => ['previous' => $old, 'current' => $osce, 'course_id' => $course->id, 'academic_year_id' => $yearId,
                    'entry_mode' => $mode ?: 'legacy_shared', 'committee' => $committee, 'recorder_person_id' => $person->id],
            ]);

            return $grade;
        });

        return ApiResponse::success(['osce_score' => $grade->osce_score, 'grade_status' => $grade->status], 'Final OSCE score saved.');
    }

    private function osceContext(StudentClinicalAssignment $assignment): array
    {
        $assignment->loadMissing('rotationBlock.rotation.course.assessmentComponents');
        $course = $assignment->rotationBlock?->rotation?->course;
        $yearId = $assignment->rotationBlock?->rotation?->academic_year_id;
        abort_unless($course && $yearId, 422, 'The assignment must have a course and academic year.');
        $component = $course->assessmentComponents->firstWhere('code', 'osce');
        abort_unless($component && (float) $component->max_score > 0 && $component->osce_entry_mode !== 'assistant', 403, 'OSCE entry is not assigned to this supervisor.');

        return [$course, (int) $yearId, (float) $component->max_score];
    }

    private function ownedPublishedAssignment(Person $person, int $assignmentId): StudentClinicalAssignment
    {
        return StudentClinicalAssignment::query()->whereKey($assignmentId)
            ->where('supervisor_id', $person->id)
            ->whereHas('distributionVersion', fn ($query) => $query->where('status', 'published')->where('is_current', true))
            ->firstOrFail();
    }

    /** Final OSCE spans the supervisor's current course/subgroup assignment, not one weekly rotation block. */
    private function osceAssignmentGroupQuery(StudentClinicalAssignment $assignment, int $courseId, int $yearId)
    {
        return StudentClinicalAssignment::query()
            ->where('supervisor_id', $assignment->supervisor_id)
            ->where('student_subgroup_id', $assignment->student_subgroup_id)
            ->when($assignment->student_subgroup_id === null, fn ($query) => $query->where('training_site_id', $assignment->training_site_id))
            ->whereHas('distributionVersion', fn ($query) => $query->where('status', 'published')->where('is_current', true))
            ->whereHas('rotationBlock.rotation', fn ($query) => $query->where('course_id', $courseId)->where('academic_year_id', $yearId));
    }

    private function persistWeeklyAssessment(
        StudentClinicalAssignment $studentAssignment,
        Person $person,
        ClinicalAssessmentTemplate $template,
        ?int $week,
        Carbon $weekStart,
        Carbon $weekEnd,
        array $snapshot,
        float $score,
        float $entryMax,
        ?string $notes,
        string $batchUuid,
        WorkflowTransitionService $workflow,
        string $kind = 'weekly',
    ): ClinicalAssessment {
        $session = $this->resolveSession($studentAssignment, $weekEnd->toDateString());
        $assessment = ClinicalAssessment::query()
            ->where('student_clinical_assignment_id', $studentAssignment->id)
            ->where('assessment_kind', $kind)
            ->where('evaluation_week', $week)
            ->where('evaluator_person_id', $person->id)
            ->lockForUpdate()->first();

        if ($assessment && ! in_array($assessment->status, ['draft', 'returned'], true)) {
            throw ValidationException::withMessages(['assessments' => ['يوجد تقييم مرسل أو معتمد مسبقاً لهذا الطالب في الموعد المحدد.']]);
        }

        $values = [
            'student_id' => $studentAssignment->student_id,
            'clinical_session_id' => $session->id,
            'evaluator_person_id' => $person->id,
            'assessment_template_id' => $template->id,
            'student_clinical_assignment_id' => $studentAssignment->id,
            'evaluation_week' => $week,
            'assessment_kind' => $kind,
            'period_guard' => $kind === 'period' ? 1 : null,
            'week_start' => $weekStart->toDateString(),
            'week_end' => $weekEnd->toDateString(),
            'assessment_batch_uuid' => $batchUuid,
            'score' => $score,
            'max_score' => $entryMax,
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

    private function validatedTotalScore(StudentClinicalAssignment $assignment, int $templateId, mixed $rawScore, ?int $week, int $evaluatorPersonId, string $kind = 'weekly'): array
    {
        $assignment->loadMissing('rotationBlock.rotation.course.assessmentComponents', 'student');
        $courseId = $assignment->rotationBlock?->rotation?->course_id;
        $batchYear = $assignment->student?->batch_year;
        $template = ClinicalAssessmentTemplate::query()->whereKey($templateId)->where('is_active', true)->with('criteria')->firstOrFail();
        $expected = ClinicalAssessmentTemplate::currentForCourse($courseId, $batchYear);
        if (! $expected || (int) $expected->id !== (int) $template->id) {
            throw ValidationException::withMessages(['template_id' => ['نموذج التقييم المحدد ليس النموذج المعتمد لهذا المساق والدفعة. حدّث الصفحة ثم أعد المحاولة.']]);
        }
        $score = round((float) $rawScore, 2);
        $component = $assignment->rotationBlock?->rotation?->course?->assessmentComponents?->firstWhere('code', 'clinical');
        $existingMax = ClinicalAssessment::query()
            ->where('student_clinical_assignment_id', $assignment->id)
            ->where('assessment_kind', $kind)
            ->where('evaluation_week', $week)
            ->where('evaluator_person_id', $evaluatorPersonId)
            ->value('max_score');
        $entryMax = (float) ($existingMax ?? $component?->entry_max_score ?? $template->total_score);
        if ($entryMax <= 0 || $score < 0 || $score > $entryMax) {
            throw ValidationException::withMessages(['score' => ["يجب أن تكون العلامة بين 0 و {$entryMax}."]]);
        }
        $snapshot = $template->criteria->map(fn ($criterion) => [
                'criterion_id' => $criterion->id,
                'code' => $criterion->code,
                'name_ar' => $criterion->name_ar,
                'name_en' => $criterion->name_en,
                'max_score' => (float) $criterion->max_score,
            ])->values()->all();

        return [$template, $snapshot, $score, $entryMax];
    }

    private function assessmentKind(StudentClinicalAssignment $assignment, mixed $week): string
    {
        $assignment->loadMissing('rotationBlock.rotation.course.assessmentComponents');
        $clinical = $assignment->rotationBlock?->rotation?->course?->assessmentComponents?->firstWhere('code', 'clinical');
        $kind = $clinical?->assessment_frequency === 'period' ? 'period' : 'weekly';
        if (($kind === 'weekly' && ! $week) || ($kind === 'period' && $week !== null)) {
            throw ValidationException::withMessages(['evaluation_week' => ['اختيار الأسبوع لا يطابق طريقة التقييم المحددة في خطة المساق.']]);
        }
        return $kind;
    }

    private function assignmentPeriod(StudentClinicalAssignment $assignment): array
    {
        [$start, $end] = $this->assignmentDateRange($assignment);
        if (! $start || ! $end || $start->isFuture()) {
            throw ValidationException::withMessages(['assignment_id' => ['فترة التدريب لم تبدأ بعد أو لا تحتوي تواريخ معتمدة.']]);
        }
        return [$start, $end];
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
                'rotationBlock.rotation.course.assessmentComponents',
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

    private function attendanceQrSession(StudentClinicalAssignment $assignment, string $date): ?ClinicalQrAttendanceSession
    {
        $key = implode('|', [
            $assignment->distribution_version_id,
            $assignment->rotation_block_id,
            $assignment->training_site_id,
            $assignment->supervisor_id,
            $assignment->student_subgroup_id ?? 0,
        ]);
        return ClinicalQrAttendanceSession::query()
            ->where('assignment_key', $key)->whereDate('session_date', $date)->first();
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
