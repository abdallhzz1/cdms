<?php

namespace App\Services\Distribution;

use App\DTOs\ClinicalScheduleItemDTO;
use App\Models\Person;
use App\Models\SiteCapacityRule;
use App\Models\StudentClinicalAssignment;
use App\Models\TrainingSite;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * TrainingSiteRosterService — Phase 5D
 *
 * Provides a paginated, filtered, deterministically sorted roster of
 * StudentClinicalAssignments for a given TrainingSite from the current
 * published distribution.
 *
 * Also provides capacity utilization calculations.
 */
class TrainingSiteRosterService
{
    public function __construct(
        private ClinicalScheduleDateCalculator $dateCalculator
    ) {}

    /**
     * Returns a paginated roster for the given TrainingSite from the current
     * published distribution. All filtering is server-side.
     */
    public function getRoster(TrainingSite $trainingSite, Request $request): LengthAwarePaginator
    {
        $query = StudentClinicalAssignment::query()
            ->where('student_clinical_assignments.training_site_id', $trainingSite->id)
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

        if ($request->filled('department_id')) {
            $query->where('student_clinical_assignments.department_id', (int) $request->input('department_id'));
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

        // Transform to DTO array
        $paginator->getCollection()->transform(function (StudentClinicalAssignment $assignment) {
            return ClinicalScheduleItemDTO::fromAssignment($assignment, $this->dateCalculator);
        });

        return $paginator;
    }

    /**
     * Returns summary aggregate metrics for the given TrainingSite, including capacity utilization.
     */
    public function getSummary(TrainingSite $trainingSite): array
    {
        $baseQuery = StudentClinicalAssignment::query()
            ->where('training_site_id', $trainingSite->id)
            ->whereHas('distributionVersion', function ($q) {
                $q->where('status', 'published')->where('is_current', true);
            });

        $total = (clone $baseQuery)->count();
        $departments = (clone $baseQuery)->distinct('department_id')->count('department_id');
        $supers = (clone $baseQuery)->whereNotNull('supervisor_id')->distinct('supervisor_id')->count('supervisor_id');
        $unSupervised = (clone $baseQuery)->whereNull('supervisor_id')->count();

        // 1. Group assignments by rotation
        $rotationCounts = (clone $baseQuery)
            ->join('rotation_blocks', 'student_clinical_assignments.rotation_block_id', '=', 'rotation_blocks.id')
            ->join('rotations', 'rotation_blocks.rotation_id', '=', 'rotations.id')
            ->selectRaw('rotations.id as rotation_id, rotations.name as rotation_name, rotations.code as rotation_code, COUNT(student_clinical_assignments.id) as assigned_count')
            ->groupBy('rotations.id', 'rotations.name', 'rotations.code')
            ->get();

        $rotationIds = $rotationCounts->pluck('rotation_id')->toArray();

        // 2. Load authoritative capacity rules in one query
        $capacityRules = SiteCapacityRule::where('site_id', $trainingSite->id)
            ->whereIn('rotation_id', $rotationIds)
            ->get()
            ->keyBy('rotation_id');

        $capacityByRotation = [];
        $hasOverCapacity = false;

        foreach ($rotationCounts as $countData) {
            $rId = $countData->rotation_id;
            $assigned = (int) $countData->assigned_count;
            $rule = $capacityRules->get($rId);
            $limit = $rule ? $rule->max_students : null;

            $statusData = $this->calculateCapacityStatus($assigned, $limit);
            
            if ($statusData['over_capacity']) {
                $hasOverCapacity = true;
            }

            $capacityByRotation[] = [
                'rotation_id'            => $rId,
                'rotation_name'          => $countData->rotation_name,
                'rotation_code'          => $countData->rotation_code,
                'capacity_limit'         => $limit,
                'assigned_count'         => $assigned,
                'available_capacity'     => $statusData['available'],
                'utilization_percentage' => $statusData['percentage'],
                'utilization_status'     => $statusData['status'],
                'over_capacity'          => $statusData['over_capacity'],
            ];
        }

        // 3. Supervisor Workload
        $supervisorWorkload = $this->buildSupervisorWorkload($trainingSite);

        return [
            'training_site' => [
                'id'                => $trainingSite->id,
                'site_code'         => $trainingSite->site_code,
                'name_ar'           => $trainingSite->name_ar,
                'name_en'           => $trainingSite->name_en,
                'site_type'         => $trainingSite->site_type,
                'city'              => $trainingSite->city,
                'is_active'         => $trainingSite->is_active,
                'coordinator_name'  => $trainingSite->coordinator_name,
                'coordinator_phone' => $trainingSite->coordinator_phone,
                'coordinator_email' => $trainingSite->coordinator_email,
            ],
            'capacity_by_rotation' => $capacityByRotation,
            'summary' => [
                'total_assigned_students'    => $total,
                'total_departments'          => $departments,
                'total_supervisors_assigned' => $supers,
                'unsupervised_assignments'   => $unSupervised,
                'has_over_capacity'          => $hasOverCapacity,
            ],
            'supervisor_workload' => $supervisorWorkload,
            'no_current_distribution' => $total === 0,
        ];
    }

    /**
     * Determines capacity utilization status according to Phase 5D Business Rules.
     */
    private function calculateCapacityStatus(int $assignedCount, ?int $capacityLimit): array
    {
        if ($capacityLimit === null) {
            return [
                'available' => null,
                'percentage' => null,
                'status' => 'NO_RULE',
                'over_capacity' => false,
            ];
        }

        if ($capacityLimit === 0) {
            return [
                'available' => 0,
                'percentage' => null,
                'status' => 'NO_CAPACITY',
                'over_capacity' => $assignedCount > 0,
            ];
        }

        $available = $capacityLimit - $assignedCount;
        $percentage = round(($assignedCount / $capacityLimit) * 100, 1);
        $overCapacity = $assignedCount > $capacityLimit;

        $status = 'AVAILABLE';
        if ($assignedCount === 0) {
            $status = 'AVAILABLE';
        } elseif ($overCapacity) {
            $status = 'OVER_CAPACITY';
        } elseif ($percentage === 100.0) {
            $status = 'FULL';
        } elseif ($percentage >= 75.0) {
            $status = 'NEAR_CAPACITY';
        }

        return [
            'available'     => $available,
            'percentage'    => $percentage,
            'status'        => $status,
            'over_capacity' => $overCapacity,
        ];
    }

    private function buildSupervisorWorkload(TrainingSite $trainingSite): array
    {
        $rows = StudentClinicalAssignment::query()
            ->where('training_site_id', $trainingSite->id)
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
