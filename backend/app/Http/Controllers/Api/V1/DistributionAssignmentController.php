<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DistributionVersion;
use App\Models\StudentClinicalAssignment;
use App\Services\Distribution\DistributionManualAssignmentService;
use App\Traits\ScopesByDepartmentAndLevel;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class DistributionAssignmentController extends Controller
{
    use ScopesByDepartmentAndLevel;

    public function __construct(
        private DistributionManualAssignmentService $manualAssignmentService
    ) {}

    public function index(Request $request, DistributionVersion $version): JsonResponse
    {
        $this->authorizeVersionAccess($version);

        $query = StudentClinicalAssignment::with(['student', 'studentSubgroup', 'rotationBlock', 'trainingSite', 'supervisor'])
            ->where('distribution_version_id', $version->id);

        if ($request->has('student_id')) {
            $query->where('student_id', $request->student_id);
        }
        if ($request->has('rotation_block_id')) {
            $query->where('rotation_block_id', $request->rotation_block_id);
        }
        if ($request->has('training_site_id')) {
            $query->where('training_site_id', $request->training_site_id);
        }

        return response()->json([
            'data' => $query->paginate(100)
        ]);
    }

    public function store(Request $request, DistributionVersion $version): JsonResponse
    {
        $this->authorizeVersionAccess($version);

        $data = $request->validate([
            'student_id' => 'required|exists:students,id',
            'student_subgroup_id' => 'nullable|exists:student_subgroups,id',
            'rotation_block_id' => 'required|exists:rotation_blocks,id',
            'training_site_id' => 'required|exists:training_sites,id',
            'supervisor_id' => 'nullable|exists:people,id',
            'force' => 'boolean',
            'override_reason' => 'nullable|string'
        ]);
        $this->authorizeStudentAccess(\App\Models\Student::findOrFail($data['student_id']));

        $assignment = $this->manualAssignmentService->createAssignment(
            $version,
            $data,
            $request->user(),
            $request->boolean('force'),
            $request->input('override_reason')
        );

        return response()->json([
            'message' => 'Assignment created successfully.',
            'data' => $assignment
        ], 201);
    }

    public function update(Request $request, DistributionVersion $version, StudentClinicalAssignment $assignment): JsonResponse
    {
        $this->authorizeVersionAccess($version);
        $this->authorizeStudentAccess($assignment->student);

        $data = $request->validate([
            'rotation_block_id' => 'sometimes|exists:rotation_blocks,id',
            'training_site_id' => 'sometimes|exists:training_sites,id',
            'supervisor_id' => 'nullable|exists:people,id',
            'force' => 'boolean',
            'override_reason' => 'nullable|string'
        ]);

        $updatedAssignment = $this->manualAssignmentService->updateAssignment(
            $version,
            $assignment,
            $data,
            $request->user(),
            $request->boolean('force'),
            $request->input('override_reason')
        );

        return response()->json([
            'message' => 'Assignment updated successfully.',
            'data' => $updatedAssignment
        ]);
    }

    public function destroy(Request $request, DistributionVersion $version, StudentClinicalAssignment $assignment): JsonResponse
    {
        $this->authorizeVersionAccess($version);
        $this->authorizeStudentAccess($assignment->student);

        $this->manualAssignmentService->deleteAssignment(
            $version,
            $assignment,
            $request->user()
        );

        return response()->json([
            'message' => 'Assignment removed successfully.'
        ]);
    }

    private function authorizeVersionAccess(DistributionVersion $version): void
    {
        $departmentId = $this->getUserDepartmentId();
        if ($departmentId && !$version->rotation()->whereHas(
            'departments',
            fn ($q) => $q->whereKey($departmentId)
        )->exists()) {
            throw new \Illuminate\Auth\Access\AuthorizationException('This action is unauthorized.');
        }
    }
}
