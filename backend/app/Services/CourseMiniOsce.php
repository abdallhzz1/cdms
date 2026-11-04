<?php

namespace App\Services;

use App\Models\StudentClinicalAssignment;
use Illuminate\Support\Collection;

/** One exam per student/course/year, owned by the last published clinical assignment. */
class CourseMiniOsce
{
    public function assignments(int $courseId, int $yearId, array $studentIds): Collection
    {
        return StudentClinicalAssignment::query()
            ->whereIn('student_id', $studentIds)
            ->whereHas('distributionVersion', fn ($q) => $q->where('status', 'published')->where('is_current', true))
            ->whereHas('rotationBlock.rotation', fn ($q) => $q->where('course_id', $courseId)->where('academic_year_id', $yearId))
            ->with(['rotationBlock.rotation', 'distributionVersion.breaks', 'supervisor', 'student'])->get();
    }

    public function lastAssignments(Collection $assignments): Collection
    {
        $dates = app(\App\Services\Distribution\ClinicalScheduleDateCalculator::class);
        return $assignments->filter(fn ($a) => $a->rotationBlock?->rotation?->start_date)
            ->sortByDesc(fn ($a) => $dates->calculateBlockEndDate(
                $a->rotationBlock->rotation->start_date, (int) $a->rotationBlock->to_week, $a->distributionVersion?->breaks ?? []
            ).':'.str_pad((string) $a->id, 20, '0', STR_PAD_LEFT))
            ->unique(fn ($a) => $a->student_id.':'.$a->rotationBlock->rotation->course_id.':'.$a->rotationBlock->rotation->academic_year_id)->values();
    }

    public function scores(Collection $last): Collection
    {
        return app(ClinicalAssessmentContinuity::class)->miniScoresForAssignments($last)
            ->groupBy('student_id')->map(fn ($rows) => $rows->count() === 1 ? $rows->first() : null);
    }

    public function directScore(int $studentId, int $courseId, int $yearId): ?float
    {
        $component = \App\Models\CourseAssessmentComponent::where('course_id', $courseId)->where('code', 'clinical')->first();
        if ($component?->mini_osce_mode !== 'direct' || (float) $component->mini_osce_max_score <= 0) return 0.0;
        $score = $this->scores($this->lastAssignments($this->assignments($courseId, $yearId, [$studentId])))->get($studentId);
        return $score && (float) $score->max_score > 0
            ? round((float) $score->score / (float) $score->max_score * (float) $component->mini_osce_max_score, 2) : null;
    }
}
