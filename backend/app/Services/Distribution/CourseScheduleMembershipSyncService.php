<?php

namespace App\Services\Distribution;

use App\Models\CourseScheduleCell;
use App\Models\ClinicalAssessment;
use App\Models\Student;
use App\Models\StudentClinicalAssignment;
use App\Models\StudentGroupAssignment;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CourseScheduleMembershipSyncService
{
    public function syncStudent(int $studentId, int $academicYearId): void
    {
        DB::transaction(function () use ($studentId, $academicYearId) {
            Student::query()->whereKey($studentId)->lockForUpdate()->firstOrFail();
            $existing = StudentClinicalAssignment::query()
                ->where('student_id', $studentId)
                ->whereNotNull('course_schedule_row_id')
                ->whereHas('distributionVersion.rotation', fn ($query) => $query->where('academic_year_id', $academicYearId))
                ->lockForUpdate()->get()->keyBy(fn (StudentClinicalAssignment $item) =>
                    $item->distribution_version_id.':'.$item->rotation_block_id);

            $subgroupIds = StudentGroupAssignment::query()
                ->where('student_id', $studentId)
                ->where('academic_year_id', $academicYearId)
                ->current()
                ->pluck('student_subgroup_id')
                ->filter();

            $cells = CourseScheduleCell::query()
                ->with(['distributionVersion.rotation', 'courseScheduleRow.person'])
                ->whereIn('student_subgroup_id', $subgroupIds->all() ?: [-1])
                ->whereHas('distributionVersion.rotation', fn ($query) => $query->where('academic_year_id', $academicYearId))
                ->whereHas('distributionVersion', fn ($query) => $query->where('status', '!=', 'withdrawn'))
                ->get();
            $desired = collect();
            foreach ($cells as $cell) {
                $row = $cell->courseScheduleRow;
                $key = $cell->distribution_version_id.':'.$cell->rotation_block_id;
                if ($desired->has($key)) {
                    throw ValidationException::withMessages(['student_subgroup_id' => ['تعارض في خلايا التوزيع لهذا الطالب؛ لم يتغير تكليفه السريري.']]);
                }
                $desired->put($key, [
                    'course_schedule_row_id' => $cell->course_schedule_row_id,
                    'student_subgroup_id' => $cell->student_subgroup_id,
                    'training_site_id' => $row->training_site_id,
                    'department_id' => $row->person?->department_id,
                    'supervisor_id' => $row->person_id,
                ]);
            }
            foreach ($existing as $key => $assignment) {
                $next = $desired->pull($key);
                $identityChanged = $next === null || collect(['student_subgroup_id', 'training_site_id', 'department_id', 'supervisor_id'])
                    ->contains(fn (string $field) => (int) $assignment->{$field} !== (int) ($next[$field] ?? null));
                if ($identityChanged && $this->hasRecordedScore($assignment)) {
                    throw ValidationException::withMessages(['student_subgroup_id' => [
                        'لا يمكن تغيير أو حذف تكليف سريري له تقييمات محفوظة. راجع العلامات والتوزيع قبل نقل الطالب.',
                    ]]);
                }
                if ($next === null) $assignment->delete();
                else $assignment->update($next);
            }
            foreach ($desired as $key => $values) {
                [$versionId, $blockId] = array_map('intval', explode(':', $key));
                StudentClinicalAssignment::create($values + [
                    'student_id' => $studentId,
                    'rotation_block_id' => $blockId,
                    'distribution_version_id' => $versionId,
                ]);
            }
        });
    }

    private function hasRecordedScore(StudentClinicalAssignment $assignment): bool
    {
        return ClinicalAssessment::query()->where('student_clinical_assignment_id', $assignment->id)->exists()
            || DB::table('clinical_mini_osce_scores')
                ->where('distribution_version_id', $assignment->distribution_version_id)
                ->where('student_id', $assignment->student_id)
                ->where('rotation_block_id', $assignment->rotation_block_id)
                ->where('entered_by_person_id', $assignment->supervisor_id)->exists();
    }
}
