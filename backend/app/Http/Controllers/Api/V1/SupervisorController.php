<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AttendanceRecord;
use App\Models\ClinicalAssessment;
use App\Models\ClinicalSession;
use App\Models\DistributionVersion;
use App\Models\Person;
use App\Models\StudentClinicalAssignment;
use App\Services\Distribution\SupervisorReassignmentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

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
        private SupervisorReassignmentService $reassignmentService
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
        $assignments = $this->currentAssignments($person);
        $studentIds = $assignments->pluck('student_id')->unique();
        $blockIds = $assignments->pluck('rotation_block_id')->filter()->unique();

        $attendance = AttendanceRecord::query()
            ->with(['student:id,university_number,full_name_ar,full_name_en', 'session:id,rotation_block_id,training_site_id,session_date,title'])
            ->whereIn('student_id', $studentIds)
            ->when($blockIds->isNotEmpty(), fn ($query) => $query->whereHas('session', fn ($session) => $session->whereIn('rotation_block_id', $blockIds)))
            ->latest('id')->limit(100)->get();

        $assessments = ClinicalAssessment::query()
            ->with(['student:id,university_number,full_name_ar,full_name_en', 'session:id,rotation_block_id,training_site_id,session_date,title'])
            ->where('evaluator_person_id', $person->id)
            ->whereIn('student_id', $studentIds)
            ->latest('id')->limit(100)->get();

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
        ]);
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

        $session = DB::transaction(function () use ($assignment, $data) {
            $session = $this->resolveSession($assignment, $data['session_date']);
            foreach ($data['records'] as $record) {
                AttendanceRecord::updateOrCreate(
                    ['clinical_session_id' => $session->id, 'student_id' => $record['student_id']],
                    ['status' => $record['status'], 'excuse_note' => $record['excuse_note'] ?? null],
                );
            }
            return $session;
        });

        return ApiResponse::success(['session_id' => $session->id], 'Attendance saved successfully.');
    }

    public function storeAssessment(Request $request): JsonResponse
    {
        [, $person] = $this->supervisorIdentity($request);
        $data = $request->validate([
            'assignment_id' => ['required', 'integer'],
            'student_id' => ['required', 'integer', 'exists:students,id'],
            'session_date' => ['required', 'date'],
            'score' => ['required', 'numeric', 'min:0', 'max:20'],
            'notes' => ['nullable', 'string', 'max:3000'],
        ]);

        $assignment = $this->ownedCurrentAssignment($person, (int) $data['assignment_id']);
        abort_unless($this->assignmentGroupQuery($assignment)->where('student_id', $data['student_id'])->exists(), 403, 'You may only assess students assigned to you.');

        $assessment = DB::transaction(function () use ($assignment, $data, $person) {
            $session = $this->resolveSession($assignment, $data['session_date']);
            return ClinicalAssessment::updateOrCreate(
                [
                    'student_id' => $data['student_id'],
                    'clinical_session_id' => $session->id,
                    'evaluator_person_id' => $person->id,
                ],
                [
                    'score' => $data['score'],
                    'max_score' => 20,
                    'notes' => $data['notes'] ?? null,
                    'status' => 'submitted',
                    'submitted_at' => now(),
                ],
            );
        });

        return ApiResponse::success($assessment->load('student', 'session'), 'Clinical assessment saved successfully.');
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
                'student:id,university_number,full_name_ar,full_name_en,academic_level',
                'studentSubgroup.group',
                'rotationBlock.rotation.academicYear',
                'rotationBlock.rotation.course',
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
        return StudentClinicalAssignment::query()
            ->where('distribution_version_id', $assignment->distribution_version_id)
            ->where('supervisor_id', $assignment->supervisor_id)
            ->where('rotation_block_id', $assignment->rotation_block_id)
            ->where('training_site_id', $assignment->training_site_id)
            ->where('student_subgroup_id', $assignment->student_subgroup_id);
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
}
