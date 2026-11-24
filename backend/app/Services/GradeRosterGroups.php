<?php

namespace App\Services;

use App\Models\StudentGroupAssignment;
use Illuminate\Support\Collection;

/** Display metadata only: never changes grade eligibility, totals or approval scope. */
class GradeRosterGroups
{
    public function forStudents(array $studentIds, int $courseId, int $yearId): Collection
    {
        if (! $studentIds) {
            return collect();
        }
        // A student can have different subgroups in different clinical periods.
        // Keep all distinct groups in this course without duplicating grade rows.
        $assignments = app(DepartmentHeadCourseScope::class)->publishedAssignments($courseId, $yearId)
            ->whereIn('student_id', $studentIds)->whereNotNull('student_subgroup_id')
            ->whereHas('studentSubgroup.group', fn ($group) => $group->where('academic_year_id', $yearId))
            ->with(['studentSubgroup:id,student_group_id,name', 'studentSubgroup.group:id,name'])
            ->select('student_id', 'student_subgroup_id')->distinct()->get();
        $groups = $assignments->groupBy('student_id')->map(fn ($rows) => $rows->map(fn ($row) => [
            'group' => ['id' => $row->studentSubgroup->group->id, 'name' => $row->studentSubgroup->group->name],
            'subgroup' => ['id' => $row->studentSubgroup->id, 'name' => $row->studentSubgroup->name],
        ])->unique(fn ($pair) => $pair['group']['id'].':'.$pair['subgroup']['id'])->values()->all());

        // Before publication (and for unscheduled students), use membership in
        // the selected academic year. Do not borrow another year's assignment.
        $remaining = array_values(array_diff($studentIds, $groups->keys()->all()));
        if ($remaining) {
            $memberships = StudentGroupAssignment::query()->whereIn('student_id', $remaining)
                ->where('academic_year_id', $yearId)->whereHas('group', fn ($group) => $group->where('academic_year_id', $yearId))
                ->with(['group:id,name', 'subgroup:id,student_group_id,name'])
                ->orderByRaw('CASE WHEN valid_until IS NULL THEN 0 ELSE 1 END')->orderByDesc('id')->get()->unique('student_id');
            foreach ($memberships as $membership) {
                $subgroup = $membership->subgroup;
                $groups->put($membership->student_id, [['group' => ['id' => $membership->group->id, 'name' => $membership->group->name],
                    'subgroup' => $subgroup && (int) $subgroup->student_group_id === (int) $membership->student_group_id ? ['id' => $subgroup->id, 'name' => $subgroup->name] : null]]);
            }
        }

        return $groups;
    }
}
