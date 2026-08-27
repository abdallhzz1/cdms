<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\DistributionVersion;
use App\Models\Student;
use App\Models\StudentClinicalAssignment;
use App\Models\StudentGroupAssignment;
use App\Models\Rotation;
use App\Models\Person;
use App\Services\Distribution\DistributionApprovalService;
use App\Services\Distribution\DistributionStateValidator;
use App\Traits\ScopesByDepartmentAndLevel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DistributionVersionController extends Controller
{
    use ScopesByDepartmentAndLevel;

    public function __construct(
        private DistributionApprovalService $approvalService,
        private DistributionStateValidator $stateValidator
    ) {}

    public function index(Request $request): JsonResponse
    {
        $query = DistributionVersion::with(['rotation.academicYear']);
        $this->applyDistributionVersionScope($query);

        if ($request->has('rotation_id')) {
            $query->where('rotation_id', $request->input('rotation_id'));
        }

        if ($request->has('status')) {
            $query->where('status', $request->input('status'));
        }

        $versions = $query->orderBy('id', 'desc')->paginate($request->input('per_page', 15));

        // Get latest published version ID per rotation
        $latestPublishedMap = DistributionVersion::where('status', 'published')
            ->select('rotation_id', DB::raw('MAX(id) as max_id'))
            ->groupBy('rotation_id')
            ->pluck('max_id', 'rotation_id')
            ->toArray();

        $versionIds = $versions->pluck('id')->toArray();

        // Get total eligible students per rotation's academic year
        $rotationAcademicYears = $versions->pluck('rotation.academic_year_id')->filter()->unique()->values()->toArray();

        $eligibleCounts = StudentGroupAssignment::query()
            ->join('students', 'students.id', '=', 'student_group_assignments.student_id')
            ->join('student_subgroups', 'student_subgroups.id', '=', 'student_group_assignments.student_subgroup_id')
            ->join('student_groups', 'student_groups.id', '=', 'student_subgroups.student_group_id')
            ->whereIn('student_group_assignments.academic_year_id', $rotationAcademicYears)
            ->whereNull('student_group_assignments.valid_until')
            ->where('students.registration_status', 'active')
            ->selectRaw('student_group_assignments.academic_year_id, student_groups.academic_level, COUNT(DISTINCT student_group_assignments.student_id) as total')
            ->groupBy('student_group_assignments.academic_year_id', 'student_groups.academic_level')
            ->get()
            ->keyBy(fn ($row) => $row->academic_year_id . '|' . $row->academic_level);

        // Assigned student counts per version
        $assignedCounts = StudentClinicalAssignment::whereIn('distribution_version_id', $versionIds)
            ->select('distribution_version_id', DB::raw('COUNT(DISTINCT student_id) as total'))
            ->groupBy('distribution_version_id')
            ->pluck('total', 'distribution_version_id')
            ->toArray();

        $versions->getCollection()->transform(function ($v) use ($latestPublishedMap, $eligibleCounts, $assignedCounts) {
            $latestPublishedId = $latestPublishedMap[$v->rotation_id] ?? null;
            $v->is_current_published = ($v->status === 'published' && $v->id === $latestPublishedId);
            $v->is_superseded = ($v->status === 'published' && $v->id !== $latestPublishedId);

            $academicYearId = $v->rotation->academic_year_id ?? null;
            $academicLevel = $v->rotation->academic_level ?? null;
            $totalEligible = (int) ($eligibleCounts->get($academicYearId . '|' . $academicLevel)?->total ?? 0);
            $assignedCount = $assignedCounts[$v->id] ?? 0;

            $v->total_eligible_students = $totalEligible;
            $v->assigned_students_count = $assignedCount;
            $v->unassigned_students_count = max(0, $totalEligible - $assignedCount);

            return $v;
        });

        return response()->json([
            'message' => 'Distribution versions retrieved successfully.',
            'data' => $versions
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'rotation_id' => ['required', 'integer', 'exists:rotations,id'],
            'name' => ['nullable', 'string', 'max:255'],
        ]);

        $rotation = Rotation::findOrFail($data['rotation_id']);
        $levelScope = $this->getEffectiveAcademicLevelScope();
        abort_if($levelScope !== null && ! in_array($rotation->academic_level, $levelScope, true), 404);
        $departmentId = $this->getClinicalOperationsDepartmentId();
        if ($departmentId && !$rotation->departments()->whereKey($departmentId)->exists()) {
            throw new \Illuminate\Auth\Access\AuthorizationException('This action is unauthorized.');
        }

        $version = DistributionVersion::create([
            'rotation_id' => $rotation->id,
            'name' => $data['name'] ?: 'Manual ' . now()->format('Y-m-d H:i'),
            'status' => 'manual',
        ]);

        return response()->json([
            'message' => 'Distribution version created successfully.',
            'data' => $version->load('rotation.academicYear'),
        ], 201);
    }

    public function show(DistributionVersion $version): JsonResponse
    {
        $this->authorizeDistributionVersionAccess($version);
        $version->load(['rotation.academicYear', 'rotation.blocks', 'rotation.siteCapacityRules.site']);

        $latestPublishedId = DistributionVersion::where('rotation_id', $version->rotation_id)
            ->where('status', 'published')
            ->max('id');

        $isCurrentPublished = ($version->status === 'published' && $version->id === $latestPublishedId);
        $isSuperseded = ($version->status === 'published' && $version->id !== $latestPublishedId);

        $assignments = StudentClinicalAssignment::where('distribution_version_id', $version->id)->get();
        $assignedStudentIds = $assignments->pluck('student_id')->unique()->toArray();

        $unassignedIds = $this->approvalService->getUnassignedStudentIds($version, $assignedStudentIds);

        $violations = $this->stateValidator->getViolations($version, $assignments->toArray());

        $approval = $this->approvalService->getValidApproval($version);

        $data = $version->toArray();
        $data['is_current_published'] = $isCurrentPublished;
        $data['is_superseded'] = $isSuperseded;
        $data['summary'] = [
            'total_students' => count($assignedStudentIds) + count($unassignedIds),
            'assigned_students' => count($assignedStudentIds),
            'unassigned_students' => count($unassignedIds),
            'total_assignments' => $assignments->count(),
            'conflicts' => count($violations),
            'sites_used' => $assignments->pluck('training_site_id')->unique()->count(),
            'blocks_used' => $assignments->pluck('rotation_block_id')->unique()->count(),
            'supervisors_assigned' => $assignments->pluck('supervisor_id')->filter()->unique()->count(),
            'approval_state' => $approval ? [
                'approved_at' => $approval->created_at->toIso8601String(),
                'fingerprint' => $approval->changes['fingerprint'] ?? null,
                'is_override' => $approval->is_override,
                'override_reason' => $approval->override_reason,
            ] : null,
        ];

        return response()->json([
            'message' => 'Distribution version details retrieved successfully.',
            'data' => $data
        ]);
    }

    public function auditLogs(DistributionVersion $version, Request $request): JsonResponse
    {
        $this->authorizeDistributionVersionAccess($version);
        $logs = AuditLog::where('distribution_version_id', $version->id)
            ->with(['user', 'student'])
            ->orderBy('id', 'desc')
            ->paginate($request->input('per_page', 20));

        return response()->json([
            'message' => 'Audit logs retrieved successfully.',
            'data' => $logs
        ]);
    }

    public function unassigned(DistributionVersion $version): JsonResponse
    {
        $this->authorizeDistributionVersionAccess($version);
        $assignments = StudentClinicalAssignment::where('distribution_version_id', $version->id)->get();
        $assignedStudentIds = $assignments->pluck('student_id')->unique()->toArray();

        $unassignedIds = $this->approvalService->getUnassignedStudentIds($version, $assignedStudentIds);

        $students = Student::with(['groupAssignments' => function ($q) use ($version) {
            $q->where('academic_year_id', $version->rotation->academic_year_id)
              ->current()
              ->whereHas('subgroup.group', fn ($group) => $group->where('academic_level', $version->rotation->academic_level))
              ->with('subgroup.group');
        }])
        ->whereIn('id', $unassignedIds)
        ->get();

        return response()->json([
            'message' => 'Unassigned students retrieved successfully.',
            'data' => $students
        ]);
    }

    public function conflicts(DistributionVersion $version): JsonResponse
    {
        $this->authorizeDistributionVersionAccess($version);
        $assignments = StudentClinicalAssignment::where('distribution_version_id', $version->id)->get()->toArray();
        $violations = $this->stateValidator->getViolations($version, $assignments);

        return response()->json([
            'message' => 'Conflicts retrieved successfully.',
            'data' => $violations
        ]);
    }

    public function options(DistributionVersion $version): JsonResponse
    {
        $this->authorizeDistributionVersionAccess($version);
        $version->loadMissing('rotation.siteCapacityRules.site');

        $siteRules = $version->rotation->siteCapacityRules;
        $siteIds = $siteRules->pluck('site_id')->filter()->values();
        $supervisors = Person::query()
            ->active()
            ->whereIn('primary_site_id', $siteIds)
            ->orderBy('full_name_ar')
            ->get(['id', 'full_name_ar', 'full_name_en', 'primary_site_id', 'department_id', 'is_active']);

        return response()->json([
            'message' => 'Distribution options retrieved successfully.',
            'data' => [
                'sites' => $siteRules->map(fn ($rule) => [
                    'id' => $rule->site?->id,
                    'site_code' => $rule->site?->site_code,
                    'name_ar' => $rule->site?->name_ar,
                    'name_en' => $rule->site?->name_en,
                    'is_active' => (bool) $rule->site?->is_active,
                    'max_students' => $rule->max_students,
                ])->filter(fn ($site) => $site['id'])->values(),
                'supervisors' => $supervisors,
            ],
        ]);
    }

    private function applyDistributionVersionScope($query): void
    {
        $levelScope = $this->getEffectiveAcademicLevelScope();
        if ($levelScope !== null) {
            $query->whereHas('rotation', fn ($rotation) => $rotation->whereIn('academic_level', $levelScope));
        }

        $departmentId = $this->getClinicalOperationsDepartmentId();
        if ($departmentId) {
            $query->whereHas('rotation.departments', fn ($q) => $q->whereKey($departmentId));
        }
    }

    private function authorizeDistributionVersionAccess(DistributionVersion $version): void
    {
        $version->loadMissing('rotation');
        $levelScope = $this->getEffectiveAcademicLevelScope();
        abort_if($levelScope !== null && (! $version->rotation || ! in_array($version->rotation->academic_level, $levelScope, true)), 404);

        $departmentId = $this->getClinicalOperationsDepartmentId();
        if ($departmentId && !$version->rotation()->whereHas(
            'departments',
            fn ($q) => $q->whereKey($departmentId)
        )->exists()) {
            throw new \Illuminate\Auth\Access\AuthorizationException('This action is unauthorized.');
        }
    }
}
