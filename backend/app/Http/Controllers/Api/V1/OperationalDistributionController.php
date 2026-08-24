<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\DistributionVersion;
use App\Models\Person;
use App\Models\Rotation;
use App\Models\Student;
use App\Models\StudentClinicalAssignment;
use App\Models\TrainingSite;
use App\Models\ClinicalDistributionPayload;
use App\Services\Distribution\CurrentDistributionResolver;
use App\Services\Distribution\DistributionApprovalService;
use App\Traits\ScopesByDepartmentAndLevel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class OperationalDistributionController extends Controller
{
    use ScopesByDepartmentAndLevel;

    public function __construct(
        private CurrentDistributionResolver $currentResolver,
        private DistributionApprovalService $approvalService,
        private \App\Services\Distribution\ClinicalScheduleQueryService $scheduleQueryService
    ) {}

    /**
     * GET /api/v1/operational/clinical-schedule
     * Master administrative schedule endpoint for current published distribution assignments.
     */
    public function administrativeSchedule(Request $request): JsonResponse
    {
        $paginator = $this->scheduleQueryService->getAdministrativeSchedule($request);

        return response()->json([
            'success' => true,
            'message' => 'Administrative clinical schedule retrieved successfully.',
            'data' => $paginator
        ]);
    }

    /**
     * Public lobby view of the current schedule. Internal database IDs,
     * university numbers, account email addresses and workflow identifiers
     * are deliberately excluded from this response.
     */
    public function publicSchedule(Request $request): JsonResponse
    {
        $paginator = $this->scheduleQueryService->getAdministrativeSchedule($request);

        $paginator->getCollection()->transform(function (array $item): array {
            $student = $item['student'] ?? null;
            $supervisor = $item['supervisor'] ?? null;
            $site = $item['training_site'] ?? null;
            $department = $item['department'] ?? null;
            $rotation = $item['rotation'] ?? null;
            $block = $item['block'] ?? null;

            return [
                'student' => $student ? [
                    'id' => $this->publicIdentifier('student', $student['id']),
                    'full_name_ar' => $student['full_name_ar'],
                    'full_name_en' => $student['full_name_en'],
                    'full_name' => $student['full_name'],
                ] : null,
                'rotation' => $rotation ? [
                    'code' => $rotation['code'],
                    'name' => $rotation['name'],
                    'academic_level' => $rotation['academic_level'],
                    'start_date' => $rotation['start_date'],
                    'end_date' => $rotation['end_date'],
                ] : null,
                'block' => $block ? [
                    'id' => $this->publicIdentifier('block', $block['id']),
                    'block_code' => $block['block_code'],
                    'from_week' => $block['from_week'],
                    'to_week' => $block['to_week'],
                    'start_date' => $block['start_date'],
                    'end_date' => $block['end_date'],
                ] : null,
                'training_site' => $site ? [
                    'id' => $this->publicIdentifier('site', $site['id']),
                    'name' => $site['name'],
                    'name_en' => $site['name_en'],
                    'name_ar' => $site['name_ar'],
                ] : null,
                'department' => $department ? [
                    'id' => $this->publicIdentifier('department', $department['id']),
                    'name' => $department['name'],
                    'name_en' => $department['name_en'],
                    'name_ar' => $department['name_ar'],
                ] : null,
                'supervisor' => $supervisor ? [
                    'id' => $this->publicIdentifier('supervisor', $supervisor['id']),
                    'full_name_ar' => $supervisor['full_name_ar'],
                    'full_name_en' => $supervisor['full_name_en'],
                    'name' => $supervisor['name'],
                ] : null,
            ];
        });

        return response()->json([
            'success' => true,
            'message' => 'Public clinical schedule retrieved successfully.',
            'data' => $paginator,
        ]);
    }

    private function publicIdentifier(string $type, int|string $id): string
    {
        return substr(hash_hmac('sha256', $type.':'.$id, (string) config('app.key')), 0, 16);
    }

    /**
     * GET /api/v1/rotations/{rotation}/current-distribution
     */
    public function currentDistribution(Rotation $rotation): JsonResponse
    {
        $this->authorizeRotationAccess($rotation);
        $currentVersion = $this->currentResolver->resolveForRotation($rotation->id);

        if (!$currentVersion) {
            return response()->json([
                'success' => false,
                'message' => 'No current published distribution version exists for this rotation.',
                'data' => null,
                'errors' => ['version' => ['No current published distribution found.']]
            ], 404);
        }

        $currentVersion->load(['rotation.academicYear', 'rotation.blocks']);

        return response()->json([
            'success' => true,
            'message' => 'Current published distribution retrieved successfully.',
            'data' => $currentVersion
        ]);
    }

    /**
     * GET /api/v1/rotations/{rotation}/current-distribution/summary
     */
    public function currentDistributionSummary(Rotation $rotation): JsonResponse
    {
        $this->authorizeRotationAccess($rotation);
        $currentVersion = $this->currentResolver->resolveForRotation($rotation->id);

        if (!$currentVersion) {
            return response()->json([
                'success' => false,
                'message' => 'No current published distribution version exists for this rotation.',
                'data' => null,
                'errors' => ['version' => ['No current published distribution found.']]
            ], 404);
        }

        $assignments = StudentClinicalAssignment::where('distribution_version_id', $currentVersion->id)->get();
        $assignedStudentIds = $assignments->pluck('student_id')->unique()->toArray();

        $unassignedIds = $this->approvalService->getUnassignedStudentIds($currentVersion, $assignedStudentIds);

        $summary = [
            'current_version_id' => $currentVersion->id,
            'rotation_id' => $rotation->id,
            'status' => $currentVersion->status,
            'is_current' => $currentVersion->is_current,
            'published_at' => $currentVersion->updated_at->toIso8601String(),
            'total_active_students' => count($assignedStudentIds) + count($unassignedIds),
            'assigned_students' => count($assignedStudentIds),
            'unassigned_students' => count($unassignedIds),
            'total_assignments' => $assignments->count(),
            'training_sites_used' => $assignments->pluck('training_site_id')->unique()->count(),
            'rotation_blocks_used' => $assignments->pluck('rotation_block_id')->unique()->count(),
            'supervisors_assigned' => $assignments->pluck('supervisor_id')->filter()->unique()->count(),
        ];

        return response()->json([
            'success' => true,
            'message' => 'Current published distribution summary retrieved successfully.',
            'data' => $summary
        ]);
    }

    /**
     * GET /api/v1/students/{student}/current-clinical-schedule
     */
    public function studentSchedule(Student $student): JsonResponse
    {
        $this->authorizeStudentAccess($student);
        $assignments = StudentClinicalAssignment::where('student_id', $student->id)
            ->whereHas('distributionVersion', function ($q) {
                $q->where('status', 'published')->where('is_current', true);
            })
            ->with([
                'rotationBlock',
                'trainingSite',
                'department',
                'supervisor',
                'distributionVersion.rotation.academicYear'
            ])
            ->get();

        return response()->json([
            'success' => true,
            'message' => 'Student current clinical schedule retrieved successfully.',
            'data' => $assignments
        ]);
    }

    /**
     * GET /api/v1/supervisors/{person}/current-clinical-schedule
     */
    public function supervisorSchedule(Person $person): JsonResponse
    {
        $this->authorizeDepartmentAccess($person->department_id ? (int) $person->department_id : null);

        $assignments = $this->applyDepartmentAccessScope(
            StudentClinicalAssignment::where('supervisor_id', $person->id),
            'student_clinical_assignments.department_id'
        )
            ->whereHas('distributionVersion', function ($q) {
                $q->where('status', 'published')->where('is_current', true);
            })
            ->with([
                'student',
                'rotationBlock',
                'trainingSite',
                'department',
                'distributionVersion.rotation.academicYear'
            ])
            ->get();

        return response()->json([
            'success' => true,
            'message' => 'Supervisor current clinical schedule retrieved successfully.',
            'data' => $assignments
        ]);
    }

    /**
     * GET /api/v1/departments/{department}/current-distribution
     */
    public function departmentDistribution(Department $department, Request $request): JsonResponse
    {
        $this->authorizeDepartmentAccess($department->id);
        $assignments = StudentClinicalAssignment::where('department_id', $department->id)
            ->whereHas('distributionVersion', function ($q) {
                $q->where('status', 'published')->where('is_current', true);
            })
            ->with([
                'student',
                'rotationBlock',
                'trainingSite',
                'supervisor',
                'distributionVersion.rotation.academicYear'
            ])
            ->orderBy('id', 'asc')
            ->paginate($request->input('per_page', 15));

        return response()->json([
            'success' => true,
            'message' => 'Department current distribution retrieved successfully.',
            'data' => $assignments
        ]);
    }

    /**
     * GET /api/v1/training-sites/{trainingSite}/current-distribution
     */
    public function trainingSiteDistribution(TrainingSite $trainingSite, Request $request): JsonResponse
    {
        $assignments = $this->applyDepartmentAccessScope(
            StudentClinicalAssignment::where('training_site_id', $trainingSite->id),
            'student_clinical_assignments.department_id'
        )
            ->whereHas('distributionVersion', function ($q) {
                $q->where('status', 'published')->where('is_current', true);
            })
            ->with([
                'student',
                'rotationBlock',
                'department',
                'supervisor',
                'distributionVersion.rotation.academicYear'
            ])
            ->orderBy('id', 'asc')
            ->paginate($request->input('per_page', 15));

        return response()->json([
            'success' => true,
            'message' => 'Training site current distribution retrieved successfully.',
            'data' => $assignments
        ]);
    }

    /**
     * GET /api/v1/rotations/{rotation}/current-distribution/unassigned
     */
    public function unassignedStudents(Rotation $rotation, Request $request): JsonResponse
    {
        $currentVersion = $this->currentResolver->resolveForRotation($rotation->id);

        if (!$currentVersion) {
            return response()->json([
                'success' => false,
                'message' => 'No current published distribution version exists for this rotation.',
                'data' => null,
                'errors' => ['version' => ['No current published distribution found.']]
            ], 404);
        }

        $assignedStudentIds = StudentClinicalAssignment::where('distribution_version_id', $currentVersion->id)
            ->pluck('student_id')
            ->unique()
            ->toArray();

        $unassignedIds = $this->approvalService->getUnassignedStudentIds($currentVersion, $assignedStudentIds);

        $students = Student::with(['groupAssignments' => function ($q) use ($rotation) {
            $q->where('academic_year_id', $rotation->academic_year_id)
              ->with('subgroup.group');
        }])
        ->whereIn('id', $unassignedIds)
        ->where('registration_status', 'active')
        ->orderBy('id', 'asc')
        ->paginate($request->input('per_page', 15));

        return response()->json([
            'success' => true,
            'message' => 'Current distribution unassigned students retrieved successfully.',
            'data' => $students
        ]);
    }

    /**
     * GET /api/v1/operational/distribution-payload/{key?}
     */
    public function getDistributionPayload(Request $request, ?string $key = null): JsonResponse
    {
        $targetKey = $key ?: $request->query('key');
        $request->validate(['key' => ['nullable', 'string', 'max:190']]);
        $this->authorizePayloadKey($request, (string) $targetKey, false);
        $payloadRecord = ClinicalDistributionPayload::where('key', $targetKey)->first();

        return response()->json([
            'success' => true,
            'data' => $payloadRecord ? $payloadRecord->payload : null,
        ]);
    }

    /**
     * POST /api/v1/operational/distribution-payload
     */
    public function saveDistributionPayload(Request $request): JsonResponse
    {
        $request->validate([
            'key' => 'required|string',
            'payload' => 'present',
        ]);

        $key = $request->input('key');
        $payload = $request->input('payload');
        $this->authorizePayloadKey($request, $key, true);

        $record = ClinicalDistributionPayload::updateOrCreate(
            ['key' => $key],
            ['payload' => $payload]
        );

        return response()->json([
            'success' => true,
            'message' => 'Operational payload saved successfully.',
            'data' => $record,
        ]);
    }

    private function authorizePayloadKey(Request $request, string $key, bool $write): void
    {
        $permission = match (true) {
            str_starts_with($key, 'cdms_grades_'),
            $key === 'cdms_student_grades',
            $key === 'cdms_submitted_grade_sheets' => $write ? 'grades.create' : 'grades.view',
            $key === 'cdms_supervisor_evaluations' => $write ? 'assessment.create' : 'assessment.view',
            $key === 'cdms_supervisor_attendance' => $write ? 'attendance.record' : 'attendance.view',
            $key === 'cdms_advising_official_forms' => $write ? 'advising.manage' : 'advising.view',
            str_starts_with($key, 'cdms_dept_head_profile_') => $write ? 'people.manage' : 'people.view',
            $key === 'cdms_academic_years' => $write ? 'academic_years.manage' : 'academic_years.view',
            str_starts_with($key, 'cdms_course_schedules_'),
            str_starts_with($key, 'cdms_clinical_partition_'),
            str_starts_with($key, 'cdms_public_reg_enabled_'),
            str_starts_with($key, 'cdms_cleared_'),
            $key === 'cdms_group_letters',
            $key === 'cdms_hospital_doctors' => $write ? 'distribution.update' : 'distribution.view',
            default => null,
        };

        $user = $request->user();
        if (!$permission || !$user || !Gate::forUser($user)->allows('permission', [$permission])) {
            throw new \Illuminate\Auth\Access\AuthorizationException('This action is unauthorized.');
        }
    }

    private function authorizeRotationAccess(Rotation $rotation): void
    {
        $departmentId = $this->getUserDepartmentId();
        if ($departmentId && !$rotation->departments()->whereKey($departmentId)->exists()) {
            throw new \Illuminate\Auth\Access\AuthorizationException('This action is unauthorized.');
        }
    }
}
