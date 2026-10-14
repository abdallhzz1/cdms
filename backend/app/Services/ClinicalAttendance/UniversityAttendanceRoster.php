<?php

namespace App\Services\ClinicalAttendance;

use App\Models\ClinicalUniversityLecture;
use App\Models\StudentGroupAssignment;
use Illuminate\Support\Collection;

class UniversityAttendanceRoster
{
    public function members(ClinicalUniversityLecture $lecture, string $date): Collection
    {
        $lecture->loadMissing('group');
        return StudentGroupAssignment::query()->where('student_group_id', $lecture->student_group_id)
            ->where('academic_year_id', $lecture->group->academic_year_id)
            ->where(fn ($query) => $query->whereNull('valid_from')->orWhereDate('valid_from', '<=', $date))
            ->where(fn ($query) => $query->whereNull('valid_until')->orWhereDate('valid_until', '>=', $date))
            ->with(['student:id,university_number,full_name_ar,full_name_en,photo_url', 'subgroup:id,name'])
            ->orderByDesc('id')->get()->unique('student_id')->values();
    }
}
