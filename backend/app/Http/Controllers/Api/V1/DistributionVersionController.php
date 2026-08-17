<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\DistributionVersion;
use App\Models\Student;
use App\Models\StudentClinicalAssignment;
use App\Services\Distribution\DistributionApprovalService;
use App\Services\Distribution\DistributionStateValidator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DistributionVersionController extends Controller
{
    public function __construct(
        private DistributionApprovalService $approvalService,
        private DistributionStateValidator $stateValidator
    ) {}

    public function index(Request $request): JsonResponse
    {
        $query = DistributionVersion::with(['rotation.academicYear']);

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
        $rotationAcademicYears = $versions->pluck('rotation.academic_year_id')->unique()->toArray();
        
        $eligibleCountPerAcademicYear = Student::whereHas('groupAssignments', function ($q) use ($rotationAcademicYears) {
            $q->whereIn('academic_year_id', $rotationAcademicYears);
        })
        ->where('registration_status', 'active')
        ->join('student_group_assignments', 'students.id', '=', 'student_group_assignments.student_id')
        ->select('student_group_assignments.academic_year_id', DB::raw('COUNT(DISTINCT students.id) as total'))
        ->groupBy('student_group_assignments.academic_year_id')
        ->pluck('total', 'academic_year_id')
        ->toArray();

        // Assigned student counts per version
        $assignedCounts = StudentClinicalAssignment::whereIn('distribution_version_id', $versionIds)
            ->select('distribution_version_id', DB::raw('COUNT(DISTINCT student_id) as total'))
            ->groupBy('distribution_version_id')
            ->pluck('total', 'distribution_version_id')
            ->toArray();

        $versions->getCollection()->transform(function ($v) use ($latestPublishedMap, $eligibleCountPerAcademicYear, $assignedCounts) {
            $latestPublishedId = $latestPublishedMap[$v->rotation_id] ?? null;
            $v->is_current_published = ($v->status === 'published' && $v->id === $latestPublishedId);
            $v->is_superseded = ($v->status === 'published' && $v->id !== $latestPublishedId);

            $academicYearId = $v->rotation->academic_year_id ?? null;
            $totalEligible = $eligibleCountPerAcademicYear[$academicYearId] ?? 0;
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

    public function show(DistributionVersion $version): JsonResponse
    {
        $version->load(['rotation.academicYear', 'rotation.blocks']);

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
        $assignments = StudentClinicalAssignment::where('distribution_version_id', $version->id)->get();
        $assignedStudentIds = $assignments->pluck('student_id')->unique()->toArray();

        $unassignedIds = $this->approvalService->getUnassignedStudentIds($version, $assignedStudentIds);

        $students = Student::with(['groupAssignments' => function ($q) use ($version) {
            $q->where('academic_year_id', $version->rotation->academic_year_id)
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
        $assignments = StudentClinicalAssignment::where('distribution_version_id', $version->id)->get()->toArray();
        $violations = $this->stateValidator->getViolations($version, $assignments);

        return response()->json([
            'message' => 'Conflicts retrieved successfully.',
            'data' => $violations
        ]);
    }
}
