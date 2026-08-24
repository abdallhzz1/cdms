<?php

namespace App\Services\Distribution;

use App\DTOs\ClinicalScheduleItemDTO;
use App\Models\Student;
use App\Models\StudentClinicalAssignment;
use App\Traits\ScopesByDepartmentAndLevel;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

class ClinicalScheduleQueryService
{
    use ScopesByDepartmentAndLevel;

    public function __construct(
        private CurrentDistributionResolver $currentResolver,
        private ClinicalScheduleDateCalculator $dateCalculator
    ) {}

    /**
     * Retrieves paginated master administrative clinical schedule items.
     * Guaranteed to query only current published distribution versions.
     * 
     * @param Request $request
     * @return LengthAwarePaginator
     */
    public function getAdministrativeSchedule(Request $request): LengthAwarePaginator
    {
        $query = StudentClinicalAssignment::query()
            ->whereHas('distributionVersion', function ($q) {
                $q->where('status', 'published')->where('is_current', true);
            })
            ->with([
                'student',
                'rotationBlock.rotation.academicYear',
                'studentSubgroup.group',
                'trainingSite',
                'department',
                'supervisor',
            ]);

        // Auto-scope by department if user is a Department Head or RTA
        $scopedDeptId = $this->getUserDepartmentId();
        if ($scopedDeptId) {
            $query->where('department_id', $scopedDeptId);
        }

        // Filters
        if ($request->filled('rotation_id')) {
            $rotationId = (int) $request->input('rotation_id');
            $query->whereHas('rotationBlock', function ($q) use ($rotationId) {
                $q->where('rotation_id', $rotationId);
            });
        }

        if ($request->filled('rotation_block_id')) {
            $query->where('rotation_block_id', (int) $request->input('rotation_block_id'));
        }

        if ($request->filled('training_site_id')) {
            $query->where('training_site_id', (int) $request->input('training_site_id'));
        }

        if (!$scopedDeptId && $request->filled('department_id')) {
            $query->where('department_id', (int) $request->input('department_id'));
        }

        if ($request->filled('supervisor_id')) {
            $query->where('supervisor_id', (int) $request->input('supervisor_id'));
        }

        if ($request->filled('student_id')) {
            $query->where('student_id', (int) $request->input('student_id'));
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

        // Deterministic SQL Sorting:
        // 1. Rotation.start_date ASC
        // 2. RotationBlock.from_week ASC
        // 3. Student.full_name_ar ASC
        // 4. StudentClinicalAssignment.id ASC
        $query->join('rotation_blocks', 'student_clinical_assignments.rotation_block_id', '=', 'rotation_blocks.id')
            ->join('rotations', 'rotation_blocks.rotation_id', '=', 'rotations.id')
            ->join('students', 'student_clinical_assignments.student_id', '=', 'students.id')
            ->select('student_clinical_assignments.*')
            ->orderBy('rotations.start_date', 'asc')
            ->orderBy('rotation_blocks.from_week', 'asc')
            ->orderBy('students.full_name_ar', 'asc')
            ->orderBy('student_clinical_assignments.id', 'asc');

        $perPage = (int) $request->input('per_page', 100);
        $perPage = min(max($perPage, 1), 100); // Clamp between 1 and 100

        $paginator = $query->paginate($perPage);

        // Transform collection to DTOs
        $paginator->getCollection()->transform(function (StudentClinicalAssignment $assignment) {
            return ClinicalScheduleItemDTO::fromAssignment($assignment, $this->dateCalculator);
        });

        return $paginator;
    }

    /**
     * Retrieves the current clinical schedule for a specific student.
     * 
     * @param Student $student
     * @return Collection
     */
    public function getStudentSchedule(Student $student): Collection
    {
        $assignments = StudentClinicalAssignment::where('student_id', $student->id)
            ->whereHas('distributionVersion', function ($q) {
                $q->where('status', 'published')->where('is_current', true);
            })
            ->with([
                'student',
                'rotationBlock.rotation.academicYear',
                'studentSubgroup.group',
                'trainingSite',
                'department',
                'supervisor',
            ])
            ->join('rotation_blocks', 'student_clinical_assignments.rotation_block_id', '=', 'rotation_blocks.id')
            ->join('rotations', 'rotation_blocks.rotation_id', '=', 'rotations.id')
            ->select('student_clinical_assignments.*')
            ->orderBy('rotations.start_date', 'asc')
            ->orderBy('rotation_blocks.from_week', 'asc')
            ->orderBy('student_clinical_assignments.id', 'asc')
            ->get();

        return $assignments->map(function (StudentClinicalAssignment $assignment) {
            return ClinicalScheduleItemDTO::fromAssignment($assignment, $this->dateCalculator);
        });
    }
}
