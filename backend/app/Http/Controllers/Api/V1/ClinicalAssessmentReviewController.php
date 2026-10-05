<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\ClinicalAssessment;
use App\Models\GradeEntry;
use App\Models\Student;
use App\Models\StudentClinicalAssignment;
use App\Models\StudentGroupAssignment;
use App\Models\StudentSubgroup;
use App\Services\ClinicalAssessmentPeriods;
use App\Traits\ScopesByDepartmentAndLevel;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Collection;

class ClinicalAssessmentReviewController extends Controller
{
    use ScopesByDepartmentAndLevel;

    public function groups(Request $request): JsonResponse
    {
        $assignments = $this->scopedAssignments($request)
            ->with([
                'student:id,university_number,full_name_ar,full_name_en,photo_url,batch_year',
                'studentSubgroup.group.academicYear:id,code',
                'rotationBlock.rotation.course.assessmentComponents',
            ])->orderBy('id')->get();

        $groupIds = $assignments->pluck('studentSubgroup.student_group_id')->filter()->unique()->values();
        $registeredSubgroups = app(\App\Services\DepartmentHeadCourseScope::class)->subgroups(StudentSubgroup::query())->whereIn('student_group_id', $groupIds)->get()->groupBy('student_group_id');
        $memberships = StudentGroupAssignment::query()->current()
            ->whereIn('student_group_id', $groupIds)
            ->whereIn('student_id', $this->reviewRosterStudents($request)->select('students.id'))
            ->with('student:id,university_number,full_name_ar,full_name_en,photo_url,batch_year')
            ->get()->groupBy('student_subgroup_id');

        $groups = $assignments->filter(fn (StudentClinicalAssignment $assignment) => $assignment->studentSubgroup?->student_group_id)
            ->groupBy(fn (StudentClinicalAssignment $assignment) => (string) $assignment->studentSubgroup->student_group_id)
            ->map(function (Collection $items, string $groupId) use ($registeredSubgroups, $memberships) {
                /** @var StudentClinicalAssignment $first */
                $first = $items->first();
                $group = $first->studentSubgroup->group;
                $subgroups = $registeredSubgroups->get((int) $groupId, collect())->map(function (StudentSubgroup $subgroup) use ($items, $memberships) {
                    $clinical = $items->where('student_subgroup_id', $subgroup->id);
                    $students = $clinical->pluck('student')->concat($memberships->get($subgroup->id, collect())->pluck('student'))
                        ->filter()->unique('id')->sortBy('university_number')->values();

                    return [
                        'id' => $subgroup->id,
                        'name' => $subgroup->name,
                        'student_count' => $students->count(),
                        'students' => $students,
                        'week_count' => $clinical->groupBy(fn (StudentClinicalAssignment $assignment) => $assignment->rotationBlock?->rotation_id)
                            ->sum(fn (Collection $rotationAssignments) => $this->weekNumbers($rotationAssignments)->count()),
                    ];
                })->sortBy('name')->values();

                return [
                    'key' => (string) $groupId,
                    'academic_year' => $group?->academicYear,
                    'group_name' => $group?->name,
                    'academic_level' => $group?->academic_level,
                    'batch_year' => $first->student?->batch_year,
                    'student_count' => $subgroups->flatMap(fn (array $subgroup) => $subgroup['students'])->unique('id')->count(),
                    'subgroups' => $subgroups,
                ];
            })->sortBy(fn (array $group) => implode('|', [
            $group['academic_year']?->code ?? '',
            $group['academic_level'] ?? '',
            $group['group_name'] ?? '',
        ]))->values();

        return ApiResponse::success(['groups' => $groups]);
    }

    public function subgroup(Request $request): JsonResponse
    {
        $data = $request->validate([
            'subgroup_id' => ['required', 'integer', 'exists:student_subgroups,id'],
        ]);

        $subgroup = StudentSubgroup::query()->with('group.academicYear:id,code')->findOrFail($data['subgroup_id']);
        abort_unless($this->scopedAssignments($request)
            ->whereHas('studentSubgroup', fn (Builder $query) => $query->where('student_group_id', $subgroup->student_group_id))
            ->exists(), 404);

        $assignments = $this->scopedAssignments($request)
            ->where('student_subgroup_id', $subgroup->id)
            ->with([
                'student:id,university_number,full_name_ar,full_name_en,photo_url,batch_year',
                'studentSubgroup.group',
                'rotationBlock.rotation.course.assessmentComponents',
                'rotationBlock.rotation.academicYear:id,code',
                'rotationBlock.rotation.clinicalPeriod:id,code,name_ar,name_en',
                'trainingSite:id,name_ar,name_en',
                'supervisor:id,full_name_ar,full_name_en',
            ])->get();

        $roster = StudentGroupAssignment::query()->current()
            ->where('student_subgroup_id', $subgroup->id)
            ->where('academic_year_id', $subgroup->group->academic_year_id)
            ->whereIn('student_id', $this->reviewRosterStudents($request)->select('students.id'))
            ->with('student:id,university_number,full_name_ar,full_name_en,photo_url,batch_year')
            ->get()->pluck('student')->filter();
        $students = $roster->concat($assignments->pluck('student')->filter())
            ->unique('id')->sortBy('university_number')->values();

        $assessments = ClinicalAssessment::query()
            ->whereIn('student_clinical_assignment_id', $assignments->pluck('id'))
            ->where(fn ($query) => $query->whereNotNull('evaluation_week')->orWhere('assessment_kind', 'period'))
            ->with('evaluator:id,full_name_ar,full_name_en')
            ->orderBy('id')->get();
        $miniScores = DB::table('clinical_mini_osce_scores')
            ->whereIn('rotation_block_id', $assignments->pluck('rotation_block_id')->filter()->unique())
            ->whereIn('student_id', $students->pluck('id'))
            ->get()->keyBy(fn ($item) => $item->student_id.':'.$item->rotation_block_id);

        // Final OSCE belongs to the course and academic year, not to an
        // assessment week. Keep its roster limited to the already scoped,
        // currently published subgroup assignments.
        $osceAssignments = $assignments->filter(function (StudentClinicalAssignment $assignment) {
            $rotation = $assignment->rotationBlock?->rotation;
            $osce = $rotation?->course?->assessmentComponents?->firstWhere('code', 'osce');

            return $rotation?->academic_year_id && $osce && (float) $osce->max_score > 0;
        })->groupBy(fn (StudentClinicalAssignment $assignment) =>
            $assignment->rotationBlock->rotation->course_id.':'.$assignment->rotationBlock->rotation->academic_year_id
        );
        $oscePairs = $osceAssignments->map(function (Collection $courseAssignments) {
            $rotation = $courseAssignments->first()->rotationBlock->rotation;

            return ['course_id' => (int) $rotation->course_id, 'academic_year_id' => (int) $rotation->academic_year_id];
        })->values();
        $osceEntries = $oscePairs->isEmpty() ? collect() : GradeEntry::query()
            ->with(['enrollment:id,student_id,course_id,academic_year_id', 'osceRecorder:id,name'])
            ->whereHas('enrollment', function (Builder $query) use ($oscePairs, $assignments) {
                $query->whereIn('student_id', $assignments->pluck('student_id')->unique())
                    ->where(function (Builder $pairs) use ($oscePairs) {
                        foreach ($oscePairs as $pair) {
                            $pairs->orWhere(fn (Builder $item) => $item
                                ->where('course_id', $pair['course_id'])
                                ->where('academic_year_id', $pair['academic_year_id']));
                        }
                    });
            })->orderBy('id')->get()->keyBy(fn (GradeEntry $entry) => implode(':', [
                $entry->enrollment->student_id,
                $entry->enrollment->course_id,
                $entry->enrollment->academic_year_id,
            ]));
        $finalOsce = $osceAssignments->map(function (Collection $courseAssignments) use ($osceEntries) {
            $rotation = $courseAssignments->first()->rotationBlock->rotation;
            $component = $rotation->course->assessmentComponents->firstWhere('code', 'osce');
            $rows = $courseAssignments->pluck('student')->filter()->unique('id')
                ->sortBy('university_number')->values()->map(function (Student $student) use ($rotation, $osceEntries) {
                    $entry = $osceEntries->get(implode(':', [$student->id, $rotation->course_id, $rotation->academic_year_id]));

                    return [
                        'student' => $student,
                        'osce_score' => $entry?->osce_score,
                        'grade_status' => $entry?->status,
                        'recorded_by' => $entry?->osceRecorder?->only(['id', 'name']),
                    ];
                });

            return [
                'course' => $rotation->course->only(['id', 'code', 'name_ar', 'name_en']),
                'academic_year' => $rotation->academicYear?->only(['id', 'code']),
                'max_score' => $component->max_score,
                'entry_mode' => $component->osce_entry_mode ?: 'legacy_shared',
                'student_count' => $rows->count(),
                'recorded_count' => $rows->whereNotNull('osce_score')->count(),
                'students' => $rows,
            ];
        })->sortBy(fn (array $item) => implode('|', [
            $item['academic_year']['code'] ?? '', $item['course']['name_ar'] ?? '', $item['course']['code'] ?? '',
        ]))->values();

        $rotations = $assignments->groupBy(fn (StudentClinicalAssignment $assignment) => (string) $assignment->rotationBlock?->rotation_id)
            ->map(function (Collection $rotationAssignments) use ($assessments, $miniScores) {
            $rotation = $rotationAssignments->first()?->rotationBlock?->rotation;
            $weeks = $this->weekNumbers($rotationAssignments)->map(function (int $number) use ($rotationAssignments, $assessments, $rotation, $miniScores) {
            $period = $number < 0 ? app(ClinicalAssessmentPeriods::class)->groups($rotationAssignments, false)
                ->first(fn (array $item) => $item['primary_block_id'] === -$number) : null;
            $active = $rotationAssignments->filter(fn (StudentClinicalAssignment $assignment) => $number < 0
                ? $period && $period['block_ids']->contains((int) $assignment->rotation_block_id)
                : ($assignment->rotationBlock
                && (int) $assignment->rotationBlock->from_week <= $number
                && (int) $assignment->rotationBlock->to_week >= $number)
            );
            $weekAssessments = ($number < 0 ? $assessments->where('assessment_kind', 'period') : $assessments->where('evaluation_week', $number))
                ->whereIn('student_clinical_assignment_id', $active->pluck('id'));
            $students = $active->unique('student_id')->sortBy(fn (StudentClinicalAssignment $assignment) => $assignment->student?->university_number ?? '')
                ->map(function (StudentClinicalAssignment $assignment) use ($active, $weekAssessments, $miniScores) {
                    $studentAssignments = $active->where('student_id', $assignment->student_id);
                    $records = $weekAssessments->where('student_id', $assignment->student_id)->map(fn (ClinicalAssessment $assessment) => [
                        'id' => $assessment->id,
                        'status' => $assessment->status,
                        'score' => $assessment->score,
                        'max_score' => $assessment->max_score,
                        'notes' => $assessment->notes,
                        'submitted_at' => $assessment->submitted_at,
                        'evaluator' => $assessment->evaluator,
                    ])->values();

                    return [
                        'student' => $assignment->student,
                        'supervisors' => $studentAssignments->pluck('supervisor')->filter()->unique('id')->values(),
                        'training_sites' => $studentAssignments->pluck('trainingSite')->filter()->unique('id')->values(),
                        'assessments' => $records,
                        'mini_osce' => $studentAssignments->map(fn (StudentClinicalAssignment $item) => $miniScores->get($item->student_id.':'.$item->rotation_block_id))->filter()->first(),
                        'ready' => $records->contains(fn (array $record) => in_array($record['status'], ['submitted', 'approved'], true)),
                    ];
                })->values();
            $periodBlock = $period ? $rotationAssignments->firstWhere('rotation_block_id', $period['primary_block_id'])?->rotationBlock : null;
            $start = $rotation?->start_date ? Carbon::parse($rotation->start_date)->addWeeks($period ? $period['start_week'] - 1 : max(0, $number - 1)) : null;

            return [
                'number' => $number,
                'block_code' => $period && $period['block_ids']->count() > 1
                    ? 'W'.$period['start_week'].'–W'.$period['end_week'] : $periodBlock?->block_code,
                'start_date' => $start?->toDateString(),
                'end_date' => $start?->copy()->addDays($period ? max(0, ($period['end_week'] - $period['start_week'] + 1) * 7 - 1) : 6)->toDateString(),
                'student_count' => $students->count(),
                'ready_count' => $students->where('ready', true)->count(),
                'students' => $students,
            ];
            })->values();

            return [
                'id' => $rotation?->id,
                'start_date' => $rotation?->start_date,
                'course' => $rotation?->course,
                'clinical_period' => $rotation?->clinicalPeriod,
                'rotation_code' => $rotation?->code,
                'weeks' => $weeks,
            ];
        })->sortBy(fn (array $rotation) => (string) ($rotation['start_date'] ?? ''))->values();

        return ApiResponse::success([
            'subgroup_id' => $subgroup->id,
            'academic_year' => $subgroup->group?->academicYear,
            'group_name' => $subgroup->group?->name,
            'subgroup_name' => $subgroup->name,
            'student_count' => $students->count(),
            'students' => $students,
            'rotations' => $rotations,
            'final_osce' => $finalOsce,
        ]);
    }

    private function scopedAssignments(Request $request): Builder
    {
        $query = app(\App\Services\DepartmentHeadCourseScope::class)->assignments(StudentClinicalAssignment::query())
            ->whereHas('distributionVersion', fn (Builder $version) => $version->where('status', 'published')->where('is_current', true))
            ->whereIn('student_id', $this->applyStudentAccessScope(Student::query())->select('students.id'));

        $departmentId = $this->getClinicalOperationsDepartmentId();
        if ($departmentId) {
            $query->where('department_id', $departmentId);
        }

        $levels = $this->getEffectiveAcademicLevelScope();
        if ($levels !== null) {
            empty($levels)
                ? $query->whereRaw('1 = 0')
                : $query->whereHas('student', fn (Builder $student) => $student->whereIn('academic_level', $levels));
        }

        $roles = $request->user()?->roles()->pluck('code') ?? collect();
        if ($roles->contains('CLINICAL_SUPERVISOR')
            && $roles->intersect(['SYS_ADMIN', 'CLINICAL_DIRECTOR', 'DEPARTMENT_HEAD', 'DEAN', 'VICE_DEAN', 'RTA', 'ADMIN_ASSISTANT'])->isEmpty()) {
            $query->where('supervisor_id', $request->user()?->person?->id ?: 0);
        }

        return $query;
    }

    private function reviewRosterStudents(Request $request): Builder
    {
        $query = $this->applyStudentAccessScope(Student::query());
        $roles = $request->user()?->roles()->pluck('code') ?? collect();

        // Cohort reviewers may see registered students before the first rotation;
        // other reviewers may only see students within their clinical scope.
        if ($roles->intersect(['SYS_ADMIN', 'DEAN', 'VICE_DEAN', 'CLINICAL_DIRECTOR', 'RTA'])->isEmpty()) {
            $query->whereIn('students.id', $this->scopedAssignments($request)->select('student_id'));
        }

        return $query;
    }

    private function weekNumbers(Collection $assignments): Collection
    {
        $course = $assignments->first()?->rotationBlock?->rotation?->course;
        if ($course?->assessmentComponents?->firstWhere('code', 'clinical')?->assessment_frequency === 'period') {
            return app(ClinicalAssessmentPeriods::class)->groups($assignments, false)
                ->pluck('primary_block_id')->map(fn ($id) => -(int) $id)->values();
        }
        return $assignments->flatMap(function (StudentClinicalAssignment $assignment) {
            $block = $assignment->rotationBlock;

            return $block && $block->from_week && $block->to_week
                && $block->from_week >= 1 && $block->from_week <= 60 && $block->from_week <= $block->to_week
                ? range((int) $block->from_week, min((int) $block->to_week, 60))
                : [];
        })->unique()->sort()->values();
    }
}
