<?php

namespace App\Services\Distribution\Reports;

use App\Models\DistributionVersion;
use App\Models\StudentClinicalAssignment;
use App\Models\TrainingSite;
use App\Models\SiteCapacityRule;
use App\Models\Person;
use App\Services\Distribution\CurrentDistributionResolver;
use App\Services\Distribution\DistributionApprovalService;
use Illuminate\Database\Eloquent\Builder;

class OperationalReportService
{
    public function __construct(
        private CurrentDistributionResolver $currentResolver,
        private DistributionApprovalService $approvalService
    ) {}

    /**
     * Resolves the authoritative current published distribution version.
     */
    public function resolveCurrentVersion(int $rotationId): ?DistributionVersion
    {
        return $this->currentResolver->resolveForRotation($rotationId);
    }

    /**
     * Base query for assignments, securely eager-loading necessary relations to avoid N+1.
     */
    private function baseAssignmentQuery(int $versionId): Builder
    {
        return StudentClinicalAssignment::where('distribution_version_id', $versionId)
            ->with([
                'student',
                'rotationBlock',
                'trainingSite',
                'department',
                'supervisor'
            ]);
    }

    /**
     * Applies standard filters to an assignment query.
     */
    private function applyFilters(Builder $query, array $filters): Builder
    {
        if (!empty($filters['department_id'])) {
            $query->where('student_clinical_assignments.department_id', $filters['department_id']);
        }
        if (!empty($filters['training_site_id'])) {
            $query->where('student_clinical_assignments.training_site_id', $filters['training_site_id']);
        }
        if (!empty($filters['supervisor_id'])) {
            $query->where('student_clinical_assignments.supervisor_id', $filters['supervisor_id']);
        }
        if (!empty($filters['rotation_block_id'])) {
            $query->where('student_clinical_assignments.rotation_block_id', $filters['rotation_block_id']);
        }
        if (!empty($filters['student_id'])) {
            $query->where('student_clinical_assignments.student_id', $filters['student_id']);
        }
        if (!empty($filters['search'])) {
            $search = '%' . $filters['search'] . '%';
            $query->whereHas('student', function ($q) use ($search) {
                $q->where('full_name_en', 'like', $search)
                  ->orWhere('full_name_ar', 'like', $search)
                  ->orWhere('university_number', 'like', $search);
            });
        }
        
        return $query;
    }

    /**
     * Report A: Student Clinical Distribution (Master)
     */
    public function getStudentDistributionQuery(int $versionId, array $filters = []): Builder
    {
        $query = $this->baseAssignmentQuery($versionId);
        $query = $this->applyFilters($query, $filters);
        
        // Deterministic sort: block from_week ASC, student name ASC
        return $query->join('rotation_blocks', 'student_clinical_assignments.rotation_block_id', '=', 'rotation_blocks.id')
                     ->join('people as students', 'student_clinical_assignments.student_id', '=', 'students.id')
                     ->orderBy('rotation_blocks.from_week', 'asc')
                     ->orderBy('students.full_name_ar', 'asc')
                     ->select('student_clinical_assignments.*');
    }

    /**
     * Report C: Department Distribution
     */
    public function getDepartmentDistributionQuery(int $versionId, int $departmentId, array $filters = []): Builder
    {
        $filters['department_id'] = $departmentId;
        $query = $this->baseAssignmentQuery($versionId);
        $query = $this->applyFilters($query, $filters);
        
        return $query->join('rotation_blocks', 'student_clinical_assignments.rotation_block_id', '=', 'rotation_blocks.id')
                     ->join('people as students', 'student_clinical_assignments.student_id', '=', 'students.id')
                     ->orderBy('rotation_blocks.from_week', 'asc')
                     ->orderBy('students.full_name_ar', 'asc')
                     ->select('student_clinical_assignments.*');
    }

    /**
     * Report D: Training Site Capacity 
     */
    public function getTrainingSiteCapacityData(int $versionId, int $rotationId, int $siteId = null, array $filters = []): array
    {
        $query = StudentClinicalAssignment::where('distribution_version_id', $versionId)
            ->join('rotation_blocks', 'student_clinical_assignments.rotation_block_id', '=', 'rotation_blocks.id');

        if ($siteId) {
            $query->where('student_clinical_assignments.training_site_id', $siteId);
        }

        if (!empty($filters['department_id'])) {
            $query->where('student_clinical_assignments.department_id', $filters['department_id']);
        }
        if (!empty($filters['rotation_block_id'])) {
            $query->where('student_clinical_assignments.rotation_block_id', $filters['rotation_block_id']);
        }
        if (!empty($filters['supervisor_id'])) {
            $query->where('student_clinical_assignments.supervisor_id', $filters['supervisor_id']);
        }
        if (!empty($filters['student_id'])) {
            $query->where('student_clinical_assignments.student_id', $filters['student_id']);
        }

        $assignedCounts = $query->selectRaw('student_clinical_assignments.training_site_id, rotation_blocks.rotation_id, COUNT(*) as assigned_count')
            ->groupBy('student_clinical_assignments.training_site_id', 'rotation_blocks.rotation_id')
            ->get()->keyBy('training_site_id');
        
        $siteQuery = TrainingSite::query();
        if ($siteId) {
            $siteQuery->where('id', $siteId);
        }
        $sites = $siteQuery->get();

        $rules = SiteCapacityRule::where('rotation_id', $rotationId)
            ->whereIn('site_id', $sites->pluck('id'))
            ->get()->keyBy('site_id');

        $result = [];
        foreach ($sites as $site) {
            $count = $assignedCounts->has($site->id) ? (int) $assignedCounts->get($site->id)->assigned_count : 0;
            $rule = $rules->get($site->id);
            $capacity = $rule ? (int) $rule->max_students : null;
            
            $status = 'NO_RULE';
            $utilization = null;
            
            if ($capacity !== null) {
                if ($capacity == 0) {
                    $status = 'NO_CAPACITY';
                    $utilization = $count > 0 ? 100 : 0;
                } else {
                    $utilization = round(($count / $capacity) * 100, 1);
                    if ($count > $capacity) $status = 'OVER_CAPACITY';
                    elseif ($count == $capacity) $status = 'AT_CAPACITY';
                    elseif ($utilization >= 75) $status = 'NEAR_CAPACITY';
                    else $status = 'UNDER_CAPACITY';
                }
            }

            $result[] = [
                'site_name_en' => $site->name_en,
                'site_name_ar' => $site->name_ar,
                'capacity' => $capacity !== null ? (string) $capacity : 'N/A',
                'assigned' => (string) $count,
                'remaining' => $capacity !== null ? (string) max(0, $capacity - $count) : 'N/A',
                'utilization_percent' => $utilization !== null ? (string) $utilization : 'N/A',
                'status' => $status
            ];
        }

        return $result;
    }

    /**
     * Report E: Supervisor Distribution
     */
    public function getSupervisorDistributionQuery(int $versionId, int $supervisorId, array $filters = []): Builder
    {
        $filters['supervisor_id'] = $supervisorId;
        $query = $this->baseAssignmentQuery($versionId);
        $query = $this->applyFilters($query, $filters);
        
        return $query->join('rotation_blocks', 'student_clinical_assignments.rotation_block_id', '=', 'rotation_blocks.id')
                     ->join('people as students', 'student_clinical_assignments.student_id', '=', 'students.id')
                     ->orderBy('rotation_blocks.from_week', 'asc')
                     ->orderBy('students.full_name_ar', 'asc')
                     ->select('student_clinical_assignments.*');
    }

    /**
     * Report F: Unassigned Students
     */
    public function getUnassignedStudentsData(DistributionVersion $version, array $filters = []): array
    {
        // Resuses exactly Phase 5B logic
        $assignments = StudentClinicalAssignment::where('distribution_version_id', $version->id)->get();
        $assignedStudentIds = $assignments->pluck('student_id')->unique()->toArray();
        $unassignedIds = $this->approvalService->getUnassignedStudentIds($version, $assignedStudentIds);
        
        $query = Person::whereIn('id', $unassignedIds);

        if (!empty($filters['search'])) {
            $search = '%' . $filters['search'] . '%';
            $query->where(function ($q) use ($search) {
                $q->where('full_name_en', 'like', $search)
                  ->orWhere('full_name_ar', 'like', $search)
                  ->orWhere('university_number', 'like', $search);
            });
        }
        
        return $query->orderBy('full_name_ar', 'asc')
            ->get()
            ->map(function($student) {
                return [
                    'student_name_en' => $student->full_name_en,
                    'student_name_ar' => $student->full_name_ar,
                    'university_number' => $student->university_number,
                    'status' => 'Unassigned'
                ];
            })->toArray();
    }
}
