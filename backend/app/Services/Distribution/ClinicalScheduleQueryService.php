<?php

namespace App\Services\Distribution;

use App\DTOs\ClinicalScheduleItemDTO;
use App\Models\Student;
use App\Models\StudentClinicalAssignment;
use App\Models\Course;
use App\Models\AcademicYear;
use App\Models\StudentGroup;
use App\Models\StudentSubgroup;
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
                'rotationBlock.rotation',
                'trainingSite',
                'department',
                'supervisor',
            ]);

        // Auto-scope by department if user is a Department Head or RTA
        $scopedDeptId = $this->getClinicalOperationsDepartmentId();
        if ($scopedDeptId) {
            $query->where('student_clinical_assignments.department_id', $scopedDeptId);
        }

        $levelScope = $this->getEffectiveAcademicLevelScope();
        if ($levelScope !== null) {
            empty($levelScope)
                ? $query->whereRaw('1 = 0')
                : $query->whereHas('rotationBlock.rotation', fn ($rotation) => $rotation->whereIn('academic_level', $levelScope));
        }

        // Filters
        if ($request->filled('rotation_id')) {
            $rotationId = (int) $request->input('rotation_id');
            $query->whereHas('rotationBlock', function ($q) use ($rotationId) {
                $q->where('rotation_id', $rotationId);
            });
        }

        if ($request->filled('academic_year_id')) {
            $academicYearId = (int) $request->input('academic_year_id');
            $query->whereHas('rotationBlock.rotation', fn ($q) => $q->where('academic_year_id', $academicYearId));
        }

        if ($request->filled('academic_level')) {
            $academicLevel = (string) $request->input('academic_level');
            $query->whereHas('rotationBlock.rotation', fn ($q) => $q->where('academic_level', $academicLevel));
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
            ->leftJoin('courses', 'rotations.course_id', '=', 'courses.id')
            ->leftJoin('academic_years', 'rotations.academic_year_id', '=', 'academic_years.id')
            ->leftJoin('student_subgroups', 'student_clinical_assignments.student_subgroup_id', '=', 'student_subgroups.id')
            ->leftJoin('student_groups', 'student_subgroups.student_group_id', '=', 'student_groups.id')
            ->select('student_clinical_assignments.*')
            ->addSelect([
                'students.university_number as dto_student_number', 'students.full_name_ar as dto_student_name_ar',
                'students.full_name_en as dto_student_name_en', 'students.registration_status as dto_student_status',
                'courses.code as dto_course_code', 'courses.name_ar as dto_course_name_ar', 'courses.name_en as dto_course_name_en',
                'academic_years.code as dto_year_code',
                'student_subgroups.name as dto_subgroup_name', 'student_groups.id as dto_group_id', 'student_groups.name as dto_group_name',
            ])
            ->orderBy('rotations.start_date', 'asc')
            ->orderBy('rotation_blocks.from_week', 'asc')
            ->orderBy('students.full_name_ar', 'asc')
            ->orderBy('student_clinical_assignments.id', 'asc');

        $perPage = (int) $request->input('per_page', 100);
        $perPage = min(max($perPage, 1), 100); // Clamp between 1 and 100

        $paginator = $query->paginate($perPage);

        // Transform collection to DTOs
        $paginator->getCollection()->transform(function (StudentClinicalAssignment $assignment) {
            $this->hydrateJoinedReferences($assignment);
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
                'rotationBlock.rotation',
                'trainingSite',
                'department',
                'supervisor',
            ])
            ->join('rotation_blocks', 'student_clinical_assignments.rotation_block_id', '=', 'rotation_blocks.id')
            ->join('rotations', 'rotation_blocks.rotation_id', '=', 'rotations.id')
            ->join('students', 'student_clinical_assignments.student_id', '=', 'students.id')
            ->leftJoin('courses', 'rotations.course_id', '=', 'courses.id')
            ->leftJoin('academic_years', 'rotations.academic_year_id', '=', 'academic_years.id')
            ->leftJoin('student_subgroups', 'student_clinical_assignments.student_subgroup_id', '=', 'student_subgroups.id')
            ->leftJoin('student_groups', 'student_subgroups.student_group_id', '=', 'student_groups.id')
            ->select('student_clinical_assignments.*')
            ->addSelect([
                'students.university_number as dto_student_number', 'students.full_name_ar as dto_student_name_ar',
                'students.full_name_en as dto_student_name_en', 'students.registration_status as dto_student_status',
                'courses.code as dto_course_code', 'courses.name_ar as dto_course_name_ar', 'courses.name_en as dto_course_name_en',
                'academic_years.code as dto_year_code',
                'student_subgroups.name as dto_subgroup_name', 'student_groups.id as dto_group_id', 'student_groups.name as dto_group_name',
            ])
            ->orderBy('rotations.start_date', 'asc')
            ->orderBy('rotation_blocks.from_week', 'asc')
            ->orderBy('student_clinical_assignments.id', 'asc')
            ->get();

        return $assignments->map(function (StudentClinicalAssignment $assignment) {
            $this->hydrateJoinedReferences($assignment);
            return ClinicalScheduleItemDTO::fromAssignment($assignment, $this->dateCalculator);
        });
    }

    private function hydrateJoinedReferences(StudentClinicalAssignment $assignment): void
    {
        $assignment->setRelation('student', (new Student())->forceFill([
            'id' => $assignment->student_id,
            'university_number' => $assignment->dto_student_number,
            'full_name_ar' => $assignment->dto_student_name_ar,
            'full_name_en' => $assignment->dto_student_name_en,
            'registration_status' => $assignment->dto_student_status,
        ]));

        $rotation = $assignment->rotationBlock?->rotation;
        if ($rotation && $rotation->course_id) {
            $rotation->setRelation('course', (new Course())->forceFill([
                'id' => $rotation->course_id, 'code' => $assignment->dto_course_code,
                'name_ar' => $assignment->dto_course_name_ar, 'name_en' => $assignment->dto_course_name_en,
            ]));
        }
        if ($rotation && $rotation->academic_year_id) {
            $rotation->setRelation('academicYear', (new AcademicYear())->forceFill([
                'id' => $rotation->academic_year_id, 'code' => $assignment->dto_year_code,
            ]));
        }

        if ($assignment->student_subgroup_id) {
            $group = $assignment->dto_group_id ? (new StudentGroup())->forceFill(['id' => $assignment->dto_group_id, 'name' => $assignment->dto_group_name]) : null;
            $subgroup = (new StudentSubgroup())->forceFill(['id' => $assignment->student_subgroup_id, 'name' => $assignment->dto_subgroup_name]);
            $subgroup->setRelation('group', $group);
            $assignment->setRelation('studentSubgroup', $subgroup);
        }
    }
}
