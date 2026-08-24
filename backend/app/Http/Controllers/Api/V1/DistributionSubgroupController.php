<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DistributionVersion;
use App\Models\StudentClinicalAssignment;
use App\Models\StudentSubgroup;
use App\Services\Distribution\DistributionSubgroupAssignmentService;
use App\Traits\ScopesByDepartmentAndLevel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DistributionSubgroupController extends Controller
{
    use ScopesByDepartmentAndLevel;

    public function __construct(private DistributionSubgroupAssignmentService $service) {}

    public function index(DistributionVersion $version): JsonResponse
    {
        $this->authorizeVersionAccess($version);
        $version->loadMissing('rotation');

        $subgroups = StudentSubgroup::query()
            ->with([
                'group',
                'assignments' => fn ($query) => $query
                    ->current()
                    ->where('academic_year_id', $version->rotation->academic_year_id)
                    ->whereHas('student', fn ($student) => $student->where('registration_status', 'active'))
                    ->with('student'),
            ])
            ->where('is_active', true)
            ->whereHas('group', fn ($query) => $query
                ->where('academic_year_id', $version->rotation->academic_year_id)
                ->where('academic_level', $version->rotation->academic_level))
            ->get()
            ->sortBy(fn (StudentSubgroup $subgroup) => ($subgroup->group?->name ?? '') . '|' . $subgroup->name)
            ->values();

        $clinicalAssignments = StudentClinicalAssignment::query()
            ->with(['rotationBlock', 'trainingSite', 'supervisor'])
            ->where('distribution_version_id', $version->id)
            ->whereIn('student_subgroup_id', $subgroups->pluck('id'))
            ->get()
            ->groupBy('student_subgroup_id');

        $data = $subgroups->map(function (StudentSubgroup $subgroup) use ($clinicalAssignments) {
            $assignments = $clinicalAssignments->get($subgroup->id, collect());
            $currentStudentIds = $subgroup->assignments->pluck('student_id')->map(fn ($id) => (int) $id)->sort()->values();
            $assignedStudentIds = $assignments->pluck('student_id')->map(fn ($id) => (int) $id)->unique()->sort()->values();

            $allocations = $assignments
                ->groupBy(fn ($assignment) => implode('|', [
                    $assignment->rotation_block_id,
                    $assignment->training_site_id,
                    $assignment->supervisor_id ?? 'none',
                ]))
                ->map(function ($items) {
                    $first = $items->first();

                    return [
                        'rotation_block_id' => $first->rotation_block_id,
                        'training_site_id' => $first->training_site_id,
                        'department_id' => $first->department_id,
                        'supervisor_id' => $first->supervisor_id,
                        'student_count' => $items->pluck('student_id')->unique()->count(),
                        'rotation_block' => $first->rotationBlock,
                        'training_site' => $first->trainingSite,
                        'supervisor' => $first->supervisor,
                    ];
                })
                ->values();

            // PHP arrays need an explicit comparison; Collection equality would also compare keys.
            $rosterChanged = $assignments->isNotEmpty() && $currentStudentIds->all() !== $assignedStudentIds->all();

            return [
                'id' => $subgroup->id,
                'name' => $subgroup->name,
                'main_group' => [
                    'id' => $subgroup->group?->id,
                    'name' => $subgroup->group?->name,
                ],
                'capacity' => (int) ($subgroup->capacity ?: $subgroup->max_size ?: 0),
                'student_count' => $currentStudentIds->count(),
                'students' => $subgroup->assignments->map(fn ($membership) => [
                    'id' => $membership->student?->id,
                    'university_number' => $membership->student?->university_number,
                    'full_name_ar' => $membership->student?->full_name_ar,
                    'full_name_en' => $membership->student?->full_name_en,
                ])->values(),
                'allocations' => $allocations,
                'roster_changed' => $rosterChanged,
                'status' => $allocations->isEmpty()
                    ? 'unassigned'
                    : (($allocations->count() > 1 || $rosterChanged) ? 'attention' : 'assigned'),
            ];
        });

        return response()->json([
            'message' => 'Distribution subgroups retrieved successfully.',
            'data' => $data,
        ]);
    }

    public function store(Request $request, DistributionVersion $version, StudentSubgroup $subgroup): JsonResponse
    {
        $this->authorizeVersionAccess($version);
        $data = $this->validated($request);
        $result = $this->service->create(
            $version,
            $subgroup,
            $data,
            $request->user(),
            $request->boolean('force'),
            $request->input('override_reason'),
        );

        return response()->json(['message' => 'Subgroup assigned successfully.', 'data' => $result], 201);
    }

    public function update(Request $request, DistributionVersion $version, StudentSubgroup $subgroup): JsonResponse
    {
        $this->authorizeVersionAccess($version);
        $data = $this->validated($request);
        $result = $this->service->update(
            $version,
            $subgroup,
            $data,
            $request->user(),
            $request->boolean('force'),
            $request->input('override_reason'),
        );

        return response()->json(['message' => 'Subgroup assignment updated successfully.', 'data' => $result]);
    }

    public function destroy(Request $request, DistributionVersion $version, StudentSubgroup $subgroup): JsonResponse
    {
        $this->authorizeVersionAccess($version);
        $this->service->delete($version, $subgroup, $request->user());

        return response()->json(['message' => 'Subgroup assignment removed successfully.', 'data' => null]);
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'rotation_block_id' => ['required', 'integer', 'exists:rotation_blocks,id'],
            'training_site_id' => ['required', 'integer', 'exists:training_sites,id'],
            'supervisor_id' => ['nullable', 'integer', 'exists:people,id'],
            'force' => ['sometimes', 'boolean'],
            'override_reason' => ['nullable', 'string', 'max:1000'],
        ]);
    }

    private function authorizeVersionAccess(DistributionVersion $version): void
    {
        $departmentId = $this->getUserDepartmentId();
        if ($departmentId && !$version->rotation()->whereHas(
            'departments',
            fn ($query) => $query->whereKey($departmentId),
        )->exists()) {
            throw new \Illuminate\Auth\Access\AuthorizationException('This action is unauthorized.');
        }
    }
}
