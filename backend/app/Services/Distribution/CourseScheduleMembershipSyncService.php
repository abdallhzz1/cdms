<?php

namespace App\Services\Distribution;

use App\Models\CourseScheduleCell;
use App\Models\StudentClinicalAssignment;
use App\Models\StudentGroupAssignment;
use Illuminate\Support\Facades\DB;

class CourseScheduleMembershipSyncService
{
    public function syncStudent(int $studentId, int $academicYearId): void
    {
        DB::transaction(function () use ($studentId, $academicYearId) {
            StudentClinicalAssignment::query()
                ->where('student_id', $studentId)
                ->whereNotNull('course_schedule_row_id')
                ->whereHas('distributionVersion.rotation', fn ($query) => $query->where('academic_year_id', $academicYearId))
                ->delete();

            $subgroupIds = StudentGroupAssignment::query()
                ->where('student_id', $studentId)
                ->where('academic_year_id', $academicYearId)
                ->current()
                ->pluck('student_subgroup_id')
                ->filter();

            if ($subgroupIds->isEmpty()) {
                return;
            }

            $cells = CourseScheduleCell::query()
                ->with(['distributionVersion.rotation', 'courseScheduleRow.person'])
                ->whereIn('student_subgroup_id', $subgroupIds)
                ->whereHas('distributionVersion.rotation', fn ($query) => $query->where('academic_year_id', $academicYearId))
                ->whereHas('distributionVersion', fn ($query) => $query->where('status', '!=', 'withdrawn'))
                ->get();

            foreach ($cells as $cell) {
                $row = $cell->courseScheduleRow;
                StudentClinicalAssignment::updateOrCreate([
                    'student_id' => $studentId,
                    'rotation_block_id' => $cell->rotation_block_id,
                    'distribution_version_id' => $cell->distribution_version_id,
                ], [
                    'course_schedule_row_id' => $cell->course_schedule_row_id,
                    'student_subgroup_id' => $cell->student_subgroup_id,
                    'training_site_id' => $row->training_site_id,
                    'department_id' => $row->person?->department_id,
                    'supervisor_id' => $row->person_id,
                ]);
            }
        });
    }
}
