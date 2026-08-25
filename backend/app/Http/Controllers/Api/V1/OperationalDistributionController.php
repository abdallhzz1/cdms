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

    public function clinicalScheduleOptions(): JsonResponse
    {
        $assignments = StudentClinicalAssignment::query()
            ->whereHas('distributionVersion', fn ($query) => $query
                ->where('status', 'published')->where('is_current', true));

        $scopedDepartmentId = $this->getClinicalOperationsDepartmentId();
        if ($scopedDepartmentId) {
            $assignments->where('student_clinical_assignments.department_id', $scopedDepartmentId);
        }


        $levelScope = $this->getEffectiveAcademicLevelScope();
        if ($levelScope !== null) {
            empty($levelScope)
                ? $assignments->whereRaw('1 = 0')
                : $assignments->whereHas('rotationBlock.rotation', fn ($rotation) => $rotation->whereIn('academic_level', $levelScope));
        }

        $siteIds = (clone $assignments)->distinct()->pluck('training_site_id')->filter();

        $rotations = Rotation::query()
            ->whereHas('distributionVersions', fn ($query) => $query
                ->where('status', 'published')->where('is_current', true))
            ->when($scopedDepartmentId, fn ($query, $departmentId) => $query
                ->whereHas('blocks', fn ($blocks) => $blocks->where('department_id', $departmentId)))
            ->when($levelScope !== null, function ($query) use ($levelScope) {
                empty($levelScope)
                    ? $query->whereRaw('1 = 0')
                    : $query->whereIn('academic_level', $levelScope);
            })
            ->with(['academicYear:id,code', 'course:id,code,name_ar,name_en'])
            ->orderBy('academic_year_id')->orderBy('academic_level')->orderBy('name')
            ->get()
            ->map(fn (Rotation $rotation) => [
                'id' => $rotation->id,
                'name' => $rotation->course?->name_ar ?: $rotation->name,
                'name_en' => $rotation->course?->name_en ?: $rotation->name,
                'code' => $rotation->course?->code ?: $rotation->code,
                'academic_level' => $rotation->academic_level,
                'academic_year_id' => $rotation->academic_year_id,
                'academic_year' => $rotation->academicYear?->code,
            ]);

        $sites = TrainingSite::whereIn('id', $siteIds)
            ->orderBy('name_ar')->get(['id', 'name_ar', 'name_en']);

        return response()->json([
            'success' => true,
            'message' => 'Clinical schedule options retrieved successfully.',
            'data' => [
                'rotations' => $rotations,
                'sites' => $sites,
            ],
        ]);
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
        $assignments = $this->scheduleQueryService->getStudentSchedule($student);

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
