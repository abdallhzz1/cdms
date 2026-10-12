<?php

namespace App\Services;

use App\Models\ClinicalAssessment;
use App\Models\CourseAssessmentComponent;
use Illuminate\Support\Collection;

/** Single source for the clinical component of a grade sheet. */
class ClinicalGradeCalculator
{
    public function scores(array $studentIds, ?int $courseId = null, ?int $academicYearId = null, bool $withMetadata = false): Collection
    {
        $clinicalMax = $courseId
            ? (float) (CourseAssessmentComponent::where('course_id', $courseId)->where('code', 'clinical')->value('max_score') ?: 20)
            : 20.0;
        $miniMax = $courseId
            ? (float) (CourseAssessmentComponent::where('course_id', $courseId)->where('code', 'clinical')->value('mini_osce_max_score') ?: 0)
            : 0.0;
        $expectedAssignments = app(DepartmentHeadCourseScope::class)
            ->publishedAssignments($courseId, $academicYearId)
            ->whereIn('student_id', $studentIds)
            ->with(['rotationBlock', 'student:id,batch_year'])->get();
        $continuity = app(ClinicalAssessmentContinuity::class);
        $currentAssessments = $continuity->forAssignments($expectedAssignments)
            ->whereIn('status', ['submitted', 'approved'])->where('max_score', '>', 0)
            ->whereNotNull('score')
            ->with(['session.rotationBlock', 'clinicalAssignment.rotationBlock'])->get();
        $currentAssessments = $continuity->distinctOfficial($currentAssessments);

        if ($miniMax > 0) {
            // Mini-OSCE is entered once per continuous training period even
            // when the clinical assessments themselves are weekly.
            $expectedPeriods = $expectedAssignments->groupBy('student_id')->map(fn ($items) =>
                app(ClinicalAssessmentPeriods::class)->groups($items, false)
                    ->map(fn (array $period) => [
                        'rotation_id' => (int) $period['assignments']->first()->rotationBlock->rotation_id,
                        'start_week' => (int) $period['start_week'],
                        'end_week' => (int) $period['end_week'],
                    ])->all());
            $mini = $continuity->miniScoresForAssignments($expectedAssignments);
            return $currentAssessments->groupBy('student_id')->map(function ($studentAssessments, $studentId) use ($mini, $miniMax, $clinicalMax, $withMetadata, $expectedPeriods, $continuity) {
                $periodScores = [];
                foreach ($expectedPeriods->get($studentId, []) as $period) {
                    $items = $studentAssessments->filter(function (ClinicalAssessment $item) use ($period) {
                        $block = $item->clinicalAssignment?->rotationBlock ?? $item->session?->rotationBlock;
                        return $block && (int) $block->rotation_id === $period['rotation_id']
                            && ($item->evaluation_week !== null
                                ? (int) $item->evaluation_week >= $period['start_week'] && (int) $item->evaluation_week <= $period['end_week']
                                : (int) $block->from_week <= $period['end_week'] && (int) $block->to_week >= $period['start_week']);
                    });
                    $miniScore = $continuity->miniForPeriod(
                        $mini, (int) $studentId, $period['rotation_id'], $period['start_week'], $period['end_week'],
                    );
                    if ($items->isEmpty() || ! $miniScore || (float) $miniScore->max_score <= 0) return $withMetadata
                        ? ['clinical_score' => null, 'assessments_count' => $studentAssessments->count()]
                        : null;
                    $fraction = $items->avg(fn ($item) => (float) $item->score / (float) $item->max_score);
                    $periodScores[] = $fraction * ($clinicalMax - $miniMax)
                        + (float) $miniScore->score / (float) $miniScore->max_score * $miniMax;
                }
                $result = $periodScores ? round(array_sum($periodScores) / count($periodScores), 2) : null;
                return $withMetadata ? ['clinical_score' => $result, 'assessments_count' => $studentAssessments->count()] : $result;
            });
        }

        // Old distribution versions remain audit-only; no historical score is
        // allowed to leak into a current or approved grade calculation.
        return $currentAssessments
            ->groupBy('student_id')->map(function ($items) use ($clinicalMax, $withMetadata) {
                $score = round($items->avg(fn (ClinicalAssessment $item) => (float) $item->score * $clinicalMax / (float) $item->max_score), 2);
                return $withMetadata
                    ? ['clinical_score' => $score, 'assessments_count' => $items->count()]
                    : $score;
            });
    }
}
