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
use Carbon\Carbon;
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
     * Complete, non-paginated subgroup roster for one training day. Only a
     * published assignment inside its block and matching supervisor work
     * availability is considered on duty at the selected site.
     */
    public function getDailyGroups(string $date, ?int $siteId = null): array
    {
        $day = Carbon::parse($date)->startOfDay();
        $assignments = $this->dailyCandidates($day, $day, $siteId)
            ->filter(fn (StudentClinicalAssignment $assignment) => $this->isOnDuty($assignment, $day));

        return $assignments->groupBy(fn (StudentClinicalAssignment $assignment) => $this->dailyGroupKey($assignment))->map(function (Collection $items) {
            /** @var StudentClinicalAssignment $first */
            $first = $items->first();
            $rotation = $first->rotationBlock->rotation;
            $group = $first->studentSubgroup->group;
            return [
                'site' => $first->trainingSite->only('id', 'name_ar', 'name_en'),
                'rotation_id' => $rotation->id,
                'course' => $rotation->course?->only('id', 'code', 'name_ar', 'name_en'),
                'academic_year' => $rotation->academicYear?->only('id', 'code'),
                'group' => ['id' => $group->id, 'name' => $group->name],
                'subgroup' => ['id' => $first->studentSubgroup->id, 'name' => $first->studentSubgroup->name],
                'supervisors' => $items->pluck('supervisor')->filter()->unique('id')->map(fn ($person) => [
                    'id' => $person->id, 'full_name_ar' => $person->full_name_ar,
                    'full_name_en' => $person->full_name_en, 'photo_url' => $person->photo_url,
                ])->values(),
                'students' => $items->groupBy('student_id')->map(function (Collection $studentAssignments) {
                    /** @var StudentClinicalAssignment $assignment */
                    $assignment = $studentAssignments->first();
                    return [
                        'id' => $assignment->student->id,
                        'university_number' => $assignment->student->university_number,
                        'full_name_ar' => $assignment->student->full_name_ar,
                        'full_name_en' => $assignment->student->full_name_en,
                        'photo_url' => $assignment->student->photo_url,
                        'supervisor_ids' => $studentAssignments->pluck('supervisor_id')->filter()->unique()->values(),
                    ];
                })->sortBy('full_name_ar')->values(),
            ];
        })->sortBy(fn (array $row) => implode('|', [
            $row['site']['name_ar'], $row['course']['code'] ?? '', $row['group']['name'], $row['subgroup']['name'],
        ]), SORT_NATURAL)->values()->all();
    }

    /** One scoped query for the whole week; no student roster is serialized in this response. */
    public function getWeeklyGroupCounts(string $weekStart, ?int $siteId = null): array
    {
        $start = Carbon::parse($weekStart)->startOfDay();
        $end = $start->copy()->addDays(6);
        $candidates = $this->dailyCandidates($start, $end, $siteId);

        $days = [];
        for ($offset = 0; $offset < 7; $offset++) {
            $day = $start->copy()->addDays($offset);
            $days[] = [
                'date' => $day->toDateString(),
                'group_count' => $candidates
                    ->filter(fn (StudentClinicalAssignment $assignment) => $this->isOnDuty($assignment, $day))
                    ->unique(fn (StudentClinicalAssignment $assignment) => $this->dailyGroupKey($assignment))
                    ->count(),
            ];
        }

        return $days;
    }

    private function dailyCandidates(Carbon $start, Carbon $end, ?int $siteId): Collection
    {
        $query = app(\App\Services\DepartmentHeadCourseScope::class)->assignments(StudentClinicalAssignment::query())
            ->whereHas('distributionVersion', fn ($version) => $version
                ->where('status', 'published')->where('is_current', true))
            ->whereHas('rotationBlock.rotation', fn ($rotation) => $rotation
                ->whereDate('start_date', '<=', $end->toDateString())
                ->where(fn ($period) => $period->whereNull('end_date')->orWhereDate('end_date', '>=', $start->toDateString())))
            ->whereNotNull('student_subgroup_id')
            ->when($siteId, fn ($assignments) => $assignments->where('training_site_id', $siteId))
            ->with([
                'student:id,university_number,full_name_ar,full_name_en,photo_url',
                'studentSubgroup.group',
                'rotationBlock.rotation.course:id,code,name_ar,name_en',
                'rotationBlock.rotation.academicYear:id,code',
                'trainingSite:id,name_ar,name_en',
                'supervisor.availabilities',
            ]);

        $departmentId = $this->getClinicalOperationsDepartmentId();
        if ($departmentId) $query->where('student_clinical_assignments.department_id', $departmentId);
        $levels = $this->getEffectiveAcademicLevelScope();
        if ($levels !== null) {
            empty($levels)
                ? $query->whereRaw('1 = 0')
                : $query->whereHas('rotationBlock.rotation', fn ($rotation) => $rotation->whereIn('academic_level', $levels));
        }

        return $query->get();
    }

    private function dailyGroupKey(StudentClinicalAssignment $assignment): string
    {
        return implode('|', [
            $assignment->training_site_id,
            $assignment->rotationBlock->rotation_id,
            $assignment->studentSubgroup->student_group_id,
            $assignment->student_subgroup_id,
        ]);
    }

    private function isOnDuty(StudentClinicalAssignment $assignment, Carbon $day): bool
    {
        $block = $assignment->rotationBlock;
        $rotation = $block?->rotation;
        if (! $assignment->student || ! $assignment->studentSubgroup?->group || ! $assignment->trainingSite
            || ! $assignment->supervisor || ! $rotation?->start_date || ! $block?->from_week || ! $block?->to_week) return false;

        $blockStart = Carbon::parse($rotation->start_date)->addWeeks((int) $block->from_week - 1)->startOfDay();
        $blockEnd = Carbon::parse($rotation->start_date)->addWeeks((int) $block->to_week)->subDay()->endOfDay();
        if ($day->lt($blockStart) || $day->gt($blockEnd)) return false;

        $weekday = strtolower($day->format('l'));
        return $assignment->supervisor->availabilities->contains(fn ($availability) =>
            (int) $availability->training_site_id === (int) $assignment->training_site_id
            && $availability->day === $weekday
            && ($availability->status ?: 'work') === 'work'
            && (! $availability->available_from || $availability->available_from->lte($day))
            && (! $availability->available_until || $availability->available_until->gte($day))
        );
    }

    /**
     * Retrieves paginated master administrative clinical schedule items.
     * Guaranteed to query only current published distribution versions.
     * 
     * @param Request $request
     * @return LengthAwarePaginator
     */
    public function getAdministrativeSchedule(Request $request): LengthAwarePaginator
    {
        $query = app(\App\Services\DepartmentHeadCourseScope::class)->assignments(StudentClinicalAssignment::query())
            ->whereHas('distributionVersion', function ($q) {
                $q->where('status', 'published')->where('is_current', true);
            })
            ->with([
                'rotationBlock.rotation',
                'rotationBlock.rotation.clinicalPeriod',
                'trainingSite',
                'department',
                'supervisor.availabilities.trainingSite',
                'supervisor.user.userProfile',
                'supervisor.user.clinicalSupervisorProfile',
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

        if ($request->filled('clinical_period_id')) {
            $clinicalPeriodId = (int) $request->input('clinical_period_id');
            $query->whereHas('rotationBlock.rotation', fn ($q) => $q->where('clinical_period_id', $clinicalPeriodId));
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
                'students.photo_url as dto_student_photo_url',
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
    public function getStudentSchedule(Student $student, bool $departmentScoped = false): Collection
    {
        $query = StudentClinicalAssignment::query();
        if ($departmentScoped) app(\App\Services\DepartmentHeadCourseScope::class)->assignments($query);
        $assignments = $query->where('student_id', $student->id)
            ->whereHas('distributionVersion', function ($q) {
                $q->where('status', 'published')->where('is_current', true);
            })
            ->with([
                'rotationBlock.rotation',
                'rotationBlock.rotation.clinicalPeriod',
                'trainingSite',
                'department',
                'supervisor.availabilities.trainingSite',
                'supervisor.user.userProfile',
                'supervisor.user.clinicalSupervisorProfile',
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
                'students.photo_url as dto_student_photo_url',
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
            'photo_url' => $assignment->dto_student_photo_url,
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
