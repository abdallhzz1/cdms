<?php

namespace App\Services\Distribution;

use App\DTOs\DashboardSummaryDTO;
use App\Models\Department;
use App\Models\DistributionVersion;
use App\Models\Person;
use App\Models\Rotation;
use App\Models\RotationBlock;
use App\Models\SiteCapacityRule;
use App\Models\Student;
use App\Models\StudentClinicalAssignment;
use App\Models\TrainingSite;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class OperationalDashboardService
{
    public function __construct(
        private CurrentDistributionResolver $currentResolver
    ) {}

    /**
     * Aggregates operational metrics exclusively from the current published distribution(s).
     * Guaranteed to execute <= 15 SQL queries using database-side aggregations.
     *
     * @param Request $request
     * @return array
     */
    public function getSummary(Request $request): array
    {
        // 1. Fetch IDs of all active current published distribution versions
        $versionQuery = DistributionVersion::query()
            ->where('status', 'published')
            ->where('is_current', true);

        if ($request->filled('rotation_id')) {
            $versionQuery->where('rotation_id', (int) $request->input('rotation_id'));
        }

        if ($request->filled('academic_level')) {
            $level = $request->input('academic_level');
            $versionQuery->whereHas('rotation', fn($q) => $q->where('academic_level', $level));
        }

        $activeVersions = $versionQuery->get();
        $versionIds = $activeVersions->pluck('id')->toArray();

        // Handle case where no distribution is currently published
        if (empty($versionIds)) {
            return DashboardSummaryDTO::toArray(
                coverage: ['total_active_students' => 0, 'assigned_students' => 0, 'unassigned_students' => 0, 'coverage_percentage' => 0.0],
                overview: ['active_rotations_count' => 0, 'active_blocks_count' => 0, 'total_placements_count' => 0, 'published_at' => null],
                alerts: ['unassigned_students_count' => 0, 'sites_near_capacity_count' => 0, 'sites_over_capacity_count' => 0, 'unsupervised_assignments_count' => 0, 'inactive_supervisor_assignments_count' => 0],
                departmentDist: [],
                siteCapacity: [],
                supervisorWorkload: []
            );
        }

        // 2. Base Query for Current Published Assignments
        $assignmentQuery = StudentClinicalAssignment::query()
            ->whereIn('student_clinical_assignments.distribution_version_id', $versionIds);

        // Apply filters
        if ($request->filled('rotation_block_id')) {
            $assignmentQuery->where('student_clinical_assignments.rotation_block_id', (int) $request->input('rotation_block_id'));
        }
        if ($request->filled('department_id')) {
            $assignmentQuery->where('student_clinical_assignments.department_id', (int) $request->input('department_id'));
        }
        if ($request->filled('training_site_id')) {
            $assignmentQuery->where('student_clinical_assignments.training_site_id', (int) $request->input('training_site_id'));
        }
        if ($request->filled('supervisor_id')) {
            $assignmentQuery->where('student_clinical_assignments.supervisor_id', (int) $request->input('supervisor_id'));
        }

        // 3. Student Coverage Calculations
        $totalActiveStudents = Student::query()
            ->where('registration_status', 'active')
            ->count();

        $assignmentRows = (clone $assignmentQuery)
            ->leftJoin('departments', 'student_clinical_assignments.department_id', '=', 'departments.id')
            ->leftJoin('training_sites', 'student_clinical_assignments.training_site_id', '=', 'training_sites.id')
            ->leftJoin('people', 'student_clinical_assignments.supervisor_id', '=', 'people.id')
            ->get([
                'student_clinical_assignments.student_id', 'student_clinical_assignments.rotation_block_id',
                'student_clinical_assignments.department_id', 'student_clinical_assignments.training_site_id',
                'student_clinical_assignments.supervisor_id',
                'departments.name_ar as department_name_ar', 'departments.name_en as department_name_en',
                'training_sites.name_ar as site_name_ar', 'training_sites.name_en as site_name_en',
                'people.full_name_ar as supervisor_name_ar', 'people.full_name_en as supervisor_name_en',
                'people.max_students as supervisor_max_students', 'people.is_active as supervisor_is_active',
            ]);

        $assignedStudentsCount = $assignmentRows->pluck('student_id')->unique()->count();

        $unassignedStudentsCount = max(0, $totalActiveStudents - $assignedStudentsCount);
        $coveragePercentage = $totalActiveStudents > 0
            ? round(($assignedStudentsCount / $totalActiveStudents) * 100, 1)
            : 0.0;

        // 4. Distribution Overview Metrics
        $totalPlacementsCount = $assignmentRows->count();
        $activeRotationsCount = count(array_unique($activeVersions->pluck('rotation_id')->toArray()));
        
        $activeBlocksCount = $assignmentRows->pluck('rotation_block_id')->unique()->count();

        $latestPublishedAt = $activeVersions->max('updated_at')?->toIso8601String();

        // 5. Department Distribution Aggregations
        $departmentDist = [];
        foreach ($assignmentRows->whereNotNull('department_id')->groupBy('department_id') as $departmentId => $rows) {
            $row = $rows->first();
            $sharePct = $totalPlacementsCount > 0
                ? round(($rows->count() / $totalPlacementsCount) * 100, 1)
                : 0.0;

            $departmentDist[] = [
                'department_id'    => (int) $departmentId,
                'name_ar'          => $row->department_name_ar,
                'name_en'          => $row->department_name_en,
                'assigned_count'   => $rows->count(),
                'share_percentage' => $sharePct,
            ];
        }

        // 6. Training Site Capacity Utilization Aggregations
        $siteRows = $assignmentRows->whereNotNull('training_site_id')->groupBy('training_site_id');
        $siteIds = $siteRows->keys()->all();

        $rotationIds = array_unique($activeVersions->pluck('rotation_id')->toArray());
        $capacityRules = SiteCapacityRule::whereIn('site_id', $siteIds)
            ->whereIn('rotation_id', $rotationIds)
            ->get()
            ->groupBy('site_id');

        $siteCapacity = [];
        $sitesNearCapacity = 0;
        $sitesOverCapacity = 0;

        foreach ($siteRows as $siteId => $rows) {
            $row = $rows->first();
            $assigned = $rows->count();
            
            // Sum max capacity limit across active rotations for this site
            $siteRules = $capacityRules->get($siteId);
            $capacityLimit = $siteRules ? $siteRules->sum('max_students') : null;

            $statusData = $this->calculateCapacityStatus($assigned, $capacityLimit);

            if ($statusData['status'] === 'NEAR_CAPACITY') {
                $sitesNearCapacity++;
            } elseif ($statusData['status'] === 'OVER_CAPACITY') {
                $sitesOverCapacity++;
            }

            $siteCapacity[] = [
                'site_id'                => (int) $siteId,
                'name_ar'                => $row->site_name_ar,
                'name_en'                => $row->site_name_en,
                'capacity_limit'         => $capacityLimit,
                'assigned_count'         => $assigned,
                'available_capacity'     => $statusData['available'],
                'utilization_percentage' => $statusData['percentage'],
                'status'                 => $statusData['status'],
            ];
        }

        // 7. Supervisor Workload Summary Aggregations
        $supervisorWorkload = [];
        $inactiveSupervisorAssignments = 0;

        foreach ($assignmentRows->whereNotNull('supervisor_id')->groupBy('supervisor_id') as $supervisorId => $rows) {
            $row = $rows->first();
            $assigned = $rows->count();
            $maxStudents = $row->supervisor_max_students;
            $workloadWarning = $maxStudents !== null && $assigned >= $maxStudents;

            if (! $row->supervisor_is_active) {
                $inactiveSupervisorAssignments += $assigned;
            }

            $supervisorWorkload[] = [
                'supervisor_id'    => (int) $supervisorId,
                'full_name_ar'     => $row->supervisor_name_ar,
                'full_name_en'     => $row->supervisor_name_en,
                'assigned_count'   => $assigned,
                'max_students'     => $maxStudents,
                'workload_warning' => $workloadWarning,
            ];
        }

        // Unsupervised assignments count
        $unsupervisedCount = $assignmentRows->whereNull('supervisor_id')->count();

        // 8. Construct Response DTO
        return DashboardSummaryDTO::toArray(
            coverage: [
                'total_active_students' => $totalActiveStudents,
                'assigned_students'     => $assignedStudentsCount,
                'unassigned_students'   => $unassignedStudentsCount,
                'coverage_percentage'   => $coveragePercentage,
            ],
            overview: [
                'active_rotations_count' => $activeRotationsCount,
                'active_blocks_count'    => $activeBlocksCount,
                'total_placements_count' => $totalPlacementsCount,
                'published_at'           => $latestPublishedAt,
            ],
            alerts: [
                'unassigned_students_count'             => $unassignedStudentsCount,
                'sites_near_capacity_count'             => $sitesNearCapacity,
                'sites_over_capacity_count'             => $sitesOverCapacity,
                'unsupervised_assignments_count'        => $unsupervisedCount,
                'inactive_supervisor_assignments_count' => $inactiveSupervisorAssignments,
            ],
            departmentDist: $departmentDist,
            siteCapacity: $siteCapacity,
            supervisorWorkload: $supervisorWorkload
        );
    }

    /**
     * Calculates capacity status and percentage per Phase 5D & Phase 6B specification.
     */
    private function calculateCapacityStatus(int $assignedCount, ?int $capacityLimit): array
    {
        if ($capacityLimit === null) {
            return [
                'available'  => null,
                'percentage' => null,
                'status'     => 'NO_RULE',
            ];
        }

        if ($capacityLimit === 0) {
            return [
                'available'  => 0,
                'percentage' => null,
                'status'     => 'NO_CAPACITY',
            ];
        }

        $available = max(0, $capacityLimit - $assignedCount);
        $percentage = round(($assignedCount / $capacityLimit) * 100, 1);

        $status = 'AVAILABLE';
        if ($assignedCount > $capacityLimit) {
            $status = 'OVER_CAPACITY';
        } elseif ($percentage === 100.0) {
            $status = 'FULL';
        } elseif ($percentage >= 75.0) {
            $status = 'NEAR_CAPACITY';
        }

        return [
            'available'  => $available,
            'percentage' => $percentage,
            'status'     => $status,
        ];
    }
}
