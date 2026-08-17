<?php

namespace App\Services\Distribution;

use App\DTOs\ClinicalScheduleItemDTO;
use App\Models\Department;
use App\Models\Person;
use App\Models\SiteCapacityRule;
use App\Models\StudentClinicalAssignment;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\Request;

/**
 * DepartmentRosterService — Phase 5D
 *
 * Provides a paginated, filtered, deterministically sorted roster of
 * StudentClinicalAssignments for a given Department from the current
 * published distribution.
 *
 * Reuses ClinicalScheduleDateCalculator for block date derivation
 * (same logic as Phase 5B — no duplication).
 */
class DepartmentRosterService
{
    public function __construct(
        private ClinicalScheduleDateCalculator $dateCalculator
    ) {}

    /**
     * Returns a paginated roster for the given Department from the current
     * published distribution. All filtering is server-side.
     */
    public function getRoster(Department $department, Request $request): LengthAwarePaginator
    {
        $query = StudentClinicalAssignment::query()
            ->where('student_clinical_assignments.department_id', $department->id)
            ->whereHas('distributionVersion', function ($q) {
                $q->where('status', 'published')->where('is_current', true);
            })
            ->with([
                'student',
                'rotationBlock.rotation.academicYear',
                'trainingSite',
                'department',
                'supervisor',
            ]);

        // ── Filters ──────────────────────────────────────────────────────────

        if ($request->filled('rotation_id')) {
            $rotationId = (int) $request->input('rotation_id');
            $query->whereHas('rotationBlock', fn($q) => $q->where('rotation_id', $rotationId));
        }

        if ($request->filled('rotation_block_id')) {
            $query->where('student_clinical_assignments.rotation_block_id', (int) $request->input('rotation_block_id'));
        }

        if ($request->filled('training_site_id')) {
            $query->where('student_clinical_assignments.training_site_id', (int) $request->input('training_site_id'));
        }

        if ($request->filled('supervisor_id')) {
            $query->where('student_clinical_assignments.supervisor_id', (int) $request->input('supervisor_id'));
        }

        if ($request->filled('academic_level')) {
            $level = $request->input('academic_level');
            $query->whereHas('rotationBlock.rotation', fn($q) => $q->where('academic_level', $level));
        }

        if ($request->filled('student_id')) {
            $query->where('student_clinical_assignments.student_id', (int) $request->input('student_id'));
        }

        if ($request->filled('search')) {
            $search = trim($request->input('search'));
            $query->whereHas('student', function ($q) use ($search) {
                $q->where(function ($sub) use ($search) {
                    $sub->where('full_name_ar', 'like', "%{$search}%")
                        ->orWhere('full_name_en', 'like', "%{$search}%")
                        ->orWhere('university_number', 'like', "%{$search}%");
                });
            });
        }

        // ── Deterministic Sorting (Phase 5B convention) ───────────────────────
        $query->join('rotation_blocks', 'student_clinical_assignments.rotation_block_id', '=', 'rotation_blocks.id')
            ->join('rotations', 'rotation_blocks.rotation_id', '=', 'rotations.id')
            ->join('students', 'student_clinical_assignments.student_id', '=', 'students.id')
            ->select('student_clinical_assignments.*')
            ->orderBy('rotations.start_date', 'asc')
            ->orderBy('rotation_blocks.from_week', 'asc')
            ->orderBy('students.full_name_ar', 'asc')
            ->orderBy('student_clinical_assignments.id', 'asc');

        $perPage = (int) $request->input('per_page', 50);
        $perPage = min(max($perPage, 1), 100);

        $paginator = $query->paginate($perPage);

        // Transform to DTO array (reuse Phase 5B DTO pattern)
        $paginator->getCollection()->transform(function (StudentClinicalAssignment $assignment) {
            return ClinicalScheduleItemDTO::fromAssignment($assignment, $this->dateCalculator);
        });

        return $paginator;
    }

    /**
     * Returns summary aggregate metrics for the given Department.
     * Uses DB aggregation — no N+1.
     */
    public function getSummary(Department $department): array
    {
        $baseQuery = StudentClinicalAssignment::query()
            ->where('department_id', $department->id)
            ->whereHas('distributionVersion', function ($q) {
                $q->where('status', 'published')->where('is_current', true);
            });

        $total   = (clone $baseQuery)->count();
        $blocks  = (clone $baseQuery)->distinct('rotation_block_id')->count('rotation_block_id');
        $sites   = (clone $baseQuery)->distinct('training_site_id')->count('training_site_id');
        $supers  = (clone $baseQuery)->whereNotNull('supervisor_id')->distinct('supervisor_id')->count('supervisor_id');
        $unSupervised = (clone $baseQuery)->whereNull('supervisor_id')->count();

        // Supervisor workload breakdown
        $supervisorWorkload = $this->buildSupervisorWorkload($department);

        return [
            'department' => [
                'id'       => $department->id,
                'code'     => $department->code,
                'name_ar'  => $department->name_ar,
                'name_en'  => $department->name_en,
                'dept_type' => $department->dept_type,
                'is_active' => $department->is_active,
            ],
            'summary' => [
                'total_assigned_students'  => $total,
                'total_rotation_blocks'    => $blocks,
                'total_training_sites'     => $sites,
                'total_supervisors_assigned' => $supers,
                'unsupervised_assignments' => $unSupervised,
            ],
            'supervisor_workload' => $supervisorWorkload,
            'no_current_distribution' => $total === 0,
        ];
    }

    /**
     * Build per-supervisor workload array for the current published distribution
     * scoped to this department.
     */
    private function buildSupervisorWorkload(Department $department): array
    {
        $rows = StudentClinicalAssignment::query()
            ->where('department_id', $department->id)
            ->whereHas('distributionVersion', function ($q) {
                $q->where('status', 'published')->where('is_current', true);
            })
            ->whereNotNull('supervisor_id')
            ->selectRaw('supervisor_id, COUNT(*) as assigned_count')
            ->groupBy('supervisor_id')
            ->get();

        if ($rows->isEmpty()) {
            return [];
        }

        $supervisorIds = $rows->pluck('supervisor_id')->toArray();
        $supervisors = Person::whereIn('id', $supervisorIds)
            ->select('id', 'full_name_ar', 'full_name_en', 'max_students', 'is_active')
            ->get()
            ->keyBy('id');

        $result = [];
        foreach ($rows as $row) {
            $person = $supervisors->get($row->supervisor_id);
            if (!$person) {
                continue;
            }

            $workloadWarning = $person->max_students !== null
                && $row->assigned_count >= $person->max_students;

            $result[] = [
                'supervisor_id'    => $person->id,
                'full_name_en'     => $person->full_name_en,
                'full_name_ar'     => $person->full_name_ar,
                'assigned_count'   => (int) $row->assigned_count,
                'max_students'     => $person->max_students,
                'is_active'        => $person->is_active,
                'workload_warning' => $workloadWarning,
            ];
        }

        return $result;
    }
}
