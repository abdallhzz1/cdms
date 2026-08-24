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

        $query = StudentClinicalAssignment::query()
            ->leftJoin('students as distribution_students', 'distribution_students.id', '=', 'student_clinical_assignments.student_id')
            ->leftJoin('student_subgroups as distribution_subgroups', 'distribution_subgroups.id', '=', 'student_clinical_assignments.student_subgroup_id')
            ->leftJoin('rotation_blocks as distribution_blocks', 'distribution_blocks.id', '=', 'student_clinical_assignments.rotation_block_id')
            ->leftJoin('training_sites as distribution_sites', 'distribution_sites.id', '=', 'student_clinical_assignments.training_site_id')
            ->leftJoin('people as distribution_supervisors', 'distribution_supervisors.id', '=', 'student_clinical_assignments.supervisor_id')
            ->where('student_clinical_assignments.distribution_version_id', $version->id)
            ->select([
                'student_clinical_assignments.*',
                'distribution_students.university_number as student_university_number',
                'distribution_students.full_name_ar as student_full_name_ar',
                'distribution_students.full_name_en as student_full_name_en',
                'distribution_subgroups.name as subgroup_name',
                'distribution_blocks.block_code as block_code',
                'distribution_blocks.from_week as block_from_week',
                'distribution_blocks.to_week as block_to_week',
                'distribution_sites.name_ar as site_name_ar',
                'distribution_sites.name_en as site_name_en',
                'distribution_supervisors.full_name_ar as supervisor_name_ar',
                'distribution_supervisors.full_name_en as supervisor_name_en',
            ]);

        if ($request->has('student_id')) {
            $query->where('student_id', $request->student_id);
        }
        if ($request->filled('search')) {
            $term = $request->input('search');
            $query->where(fn ($student) => $student
                ->where('distribution_students.university_number', 'like', "%{$term}%")
                ->orWhere('distribution_students.full_name_ar', 'like', "%{$term}%")
                ->orWhere('distribution_students.full_name_en', 'like', "%{$term}%"));
        }
        if ($request->filled('rotation_block_id') || $request->filled('block_id')) {
            $query->where('rotation_block_id', $request->input('rotation_block_id', $request->input('block_id')));
        }
        if ($request->filled('training_site_id') || $request->filled('site_id')) {
            $query->where('training_site_id', $request->input('training_site_id', $request->input('site_id')));
        }
        if ($request->filled('department_id')) {
            $query->where('department_id', $request->input('department_id'));
        }
        if ($request->filled('supervisor_id')) {
            $query->where('supervisor_id', $request->input('supervisor_id'));
        }
        if ($request->filled('subgroup_id')) {
            $query->where('student_subgroup_id', $request->input('subgroup_id'));
        }

        $assignments = $query->orderBy('student_clinical_assignments.student_subgroup_id')
            ->orderBy('student_clinical_assignments.student_id')
            ->paginate(min(max($request->integer('per_page', 100), 1), 200));

        $assignments->setCollection($assignments->getCollection()->map(fn ($item) => [
            'id' => $item->id,
            'distribution_version_id' => $item->distribution_version_id,
            'student_id' => $item->student_id,
            'student_subgroup_id' => $item->student_subgroup_id,
            'rotation_block_id' => $item->rotation_block_id,
            'training_site_id' => $item->training_site_id,
            'department_id' => $item->department_id,
            'supervisor_id' => $item->supervisor_id,
            'created_at' => $item->created_at,
            'updated_at' => $item->updated_at,
            'student' => [
                'id' => $item->student_id,
                'university_number' => $item->student_university_number,
                'full_name_ar' => $item->student_full_name_ar,
                'full_name_en' => $item->student_full_name_en,
            ],
            'student_subgroup' => $item->student_subgroup_id ? ['id' => $item->student_subgroup_id, 'name' => $item->subgroup_name] : null,
            'rotation_block' => [
                'id' => $item->rotation_block_id,
                'block_code' => $item->block_code,
                'from_week' => $item->block_from_week,
                'to_week' => $item->block_to_week,
            ],
            'training_site' => [
                'id' => $item->training_site_id,
                'name_ar' => $item->site_name_ar,
                'name_en' => $item->site_name_en,
            ],
            'supervisor' => $item->supervisor_id ? [
                'id' => $item->supervisor_id,
                'full_name_ar' => $item->supervisor_name_ar,
                'full_name_en' => $item->supervisor_name_en,
            ] : null,
        ]));

        return response()->json(['data' => $assignments]);
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
