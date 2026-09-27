<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\ClinicalAssessment;
use App\Models\Student;
use App\Models\StudentClinicalAssignment;
use App\Traits\ScopesByDepartmentAndLevel;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

class ClinicalAssessmentReviewController extends Controller
{
    use ScopesByDepartmentAndLevel;

    public function groups(Request $request): JsonResponse
    {
        $assignments = $this->scopedAssignments($request)
            ->with([
                'student:id,batch_year',
                'studentSubgroup.group',
                'rotationBlock.rotation.course:id,code,name_ar,name_en',
                'rotationBlock.rotation.academicYear:id,code',
                'rotationBlock.rotation.clinicalPeriod:id,code,name_ar,name_en',
            ])->orderBy('id')->get();

        $groups = $assignments->groupBy(fn (StudentClinicalAssignment $assignment) => implode('|', [
            $assignment->distribution_version_id,
            $assignment->studentSubgroup?->student_group_id ?: 0,
            $assignment->student?->batch_year ?: 0,
        ]))->map(function (Collection $items) {
            /** @var StudentClinicalAssignment $first */
            $first = $items->first();
            $rotation = $first->rotationBlock?->rotation;
            $subgroups = $items->groupBy(fn (StudentClinicalAssignment $assignment) => (string) ($assignment->student_subgroup_id ?: 0))
                ->map(function (Collection $members) {
                    /** @var StudentClinicalAssignment $member */
                    $member = $members->first();

                    return [
                        'assignment_id' => $member->id,
                        'name' => $member->studentSubgroup?->name,
                        'student_count' => $members->pluck('student_id')->unique()->count(),
                        'week_count' => $this->weekNumbers($members)->count(),
                    ];
                })->sortBy(fn (array $subgroup) => $subgroup['name'] ?? '')->values();

            return [
                'key' => implode('|', [
                    $first->distribution_version_id,
                    $first->studentSubgroup?->student_group_id ?: 0,
                    $first->student?->batch_year ?: 0,
                ]),
                'academic_year' => $rotation?->academicYear,
                'course' => $rotation?->course,
                'clinical_period' => $rotation?->clinicalPeriod,
                'rotation_code' => $rotation?->code,
                'group_name' => $first->studentSubgroup?->group?->name,
                'academic_level' => $rotation?->academic_level,
                'batch_year' => $first->student?->batch_year,
                'student_count' => $items->pluck('student_id')->unique()->count(),
                'subgroups' => $subgroups,
            ];
        })->sortBy(fn (array $group) => implode('|', [
            $group['academic_year']?->code ?? '',
            $group['course']?->code ?? '',
            $group['group_name'] ?? '',
            $group['batch_year'] ?? '',
        ]))->values();

        return ApiResponse::success(['groups' => $groups]);
    }

    public function subgroup(Request $request): JsonResponse
    {
        $data = $request->validate([
            'assignment_id' => ['required', 'integer', 'exists:student_clinical_assignments,id'],
        ]);

        /** @var StudentClinicalAssignment $reference */
        $reference = $this->scopedAssignments($request)
            ->with('student:id,batch_year')
            ->findOrFail($data['assignment_id']);

        $assignments = $this->scopedAssignments($request)
            ->where('distribution_version_id', $reference->distribution_version_id)
            ->where('student_subgroup_id', $reference->student_subgroup_id)
            ->whereHas('student', fn (Builder $student) => $student->where('batch_year', $reference->student?->batch_year))
            ->with([
                'student:id,university_number,full_name_ar,full_name_en,photo_url,batch_year',
                'studentSubgroup.group',
                'rotationBlock.rotation.course:id,code,name_ar,name_en',
                'rotationBlock.rotation.academicYear:id,code',
                'rotationBlock.rotation.clinicalPeriod:id,code,name_ar,name_en',
                'trainingSite:id,name_ar,name_en',
                'supervisor:id,full_name_ar,full_name_en',
            ])->get();

        $assessments = ClinicalAssessment::query()
            ->whereIn('student_clinical_assignment_id', $assignments->pluck('id'))
            ->whereNotNull('evaluation_week')
            ->with('evaluator:id,full_name_ar,full_name_en')
            ->orderBy('id')->get()->groupBy('evaluation_week');

        $rotation = $assignments->first()?->rotationBlock?->rotation;
        $weeks = $this->weekNumbers($assignments)->map(function (int $number) use ($assignments, $assessments, $rotation) {
            $active = $assignments->filter(fn (StudentClinicalAssignment $assignment) =>
                $assignment->rotationBlock
                && (int) $assignment->rotationBlock->from_week <= $number
                && (int) $assignment->rotationBlock->to_week >= $number
            );
            $weekAssessments = $assessments->get($number, collect())
                ->whereIn('student_clinical_assignment_id', $active->pluck('id'));
            $students = $active->unique('student_id')->sortBy(fn (StudentClinicalAssignment $assignment) => $assignment->student?->university_number ?? '')
                ->map(function (StudentClinicalAssignment $assignment) use ($active, $weekAssessments) {
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
                        'ready' => $records->contains(fn (array $record) => in_array($record['status'], ['submitted', 'approved'], true)),
                    ];
                })->values();
            $start = $rotation?->start_date ? Carbon::parse($rotation->start_date)->addWeeks($number - 1) : null;

            return [
                'number' => $number,
                'start_date' => $start?->toDateString(),
                'end_date' => $start?->copy()->addDays(6)->toDateString(),
                'student_count' => $students->count(),
                'ready_count' => $students->where('ready', true)->count(),
                'students' => $students,
            ];
        })->values();

        $first = $assignments->first();

        return ApiResponse::success([
            'assignment_id' => $reference->id,
            'academic_year' => $rotation?->academicYear,
            'course' => $rotation?->course,
            'clinical_period' => $rotation?->clinicalPeriod,
            'rotation_code' => $rotation?->code,
            'group_name' => $first?->studentSubgroup?->group?->name,
            'subgroup_name' => $first?->studentSubgroup?->name,
            'batch_year' => $first?->student?->batch_year,
            'student_count' => $assignments->pluck('student_id')->unique()->count(),
            'weeks' => $weeks,
        ]);
    }

    private function scopedAssignments(Request $request): Builder
    {
        $query = StudentClinicalAssignment::query()
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

    private function weekNumbers(Collection $assignments): Collection
    {
        return $assignments->flatMap(function (StudentClinicalAssignment $assignment) {
            $block = $assignment->rotationBlock;

            return $block && $block->from_week && $block->to_week
                && $block->from_week >= 1 && $block->from_week <= 60 && $block->from_week <= $block->to_week
                ? range((int) $block->from_week, min((int) $block->to_week, 60))
                : [];
        })->unique()->sort()->values();
    }
}
