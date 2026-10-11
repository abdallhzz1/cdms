<?php

namespace App\Services;

use App\Models\ClinicalAssessment;
use App\Models\StudentClinicalAssignment;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/** Keeps submitted assessments attached to their original audit record across distribution revisions. */
class ClinicalAssessmentContinuity
{
    /** @param Collection<int, StudentClinicalAssignment> $assignments */
    public function forAssignments(Collection $assignments): Builder
    {
        if ($assignments instanceof \Illuminate\Database\Eloquent\Collection) {
            $assignments->loadMissing('rotationBlock');
        }
        $studentIds = $assignments->pluck('student_id')->filter()->unique()->values();
        $rotationIds = $assignments->map(fn (StudentClinicalAssignment $assignment) => $assignment->rotationBlock?->rotation_id)
            ->filter()->unique()->values();

        $query = ClinicalAssessment::query();
        if ($studentIds->isEmpty() || $rotationIds->isEmpty()) {
            return $query->whereRaw('1 = 0');
        }

        return $query->whereIn('student_id', $studentIds)
            ->where(function (Builder $records) use ($rotationIds) {
                $records->whereHas('clinicalAssignment.rotationBlock', fn (Builder $block) => $block->whereIn('rotation_id', $rotationIds))
                    ->orWhereHas('session.rotationBlock', fn (Builder $block) => $block->whereIn('rotation_id', $rotationIds));
            });
    }

    public function forSlot(
        StudentClinicalAssignment $assignment,
        int $studentId,
        int $evaluatorId,
        string $kind,
        ?int $week,
        CarbonInterface $start,
        CarbonInterface $end,
    ): Builder {
        $assignment->loadMissing('rotationBlock');
        $query = $this->forAssignments(collect([$assignment]))
            ->where('student_id', $studentId)
            ->where('evaluator_person_id', $evaluatorId)
            ->where('assessment_kind', $kind)
            ->where('evaluation_week', $week);

        // A course can contain several separate training periods. A revised
        // distribution must preserve only the assessment for this same period.
        if ($kind === 'period') {
            $query->whereDate('week_start', '<=', $end->toDateString())
                ->whereDate('week_end', '>=', $start->toDateString());
        }

        return $query;
    }

    /**
     * Old versions may already contain duplicate submissions. Count the first
     * official submission once per logical student/supervisor/rotation slot;
     * never delete or silently rewrite the later audit records.
     *
     * @param Collection<int, ClinicalAssessment> $assessments
     * @return Collection<int, ClinicalAssessment>
     */
    public function distinctOfficial(Collection $assessments): Collection
    {
        return $assessments->sortBy('id')->unique(function (ClinicalAssessment $assessment) {
            $rotationId = $assessment->clinicalAssignment?->rotationBlock?->rotation_id
                ?? $assessment->session?->rotationBlock?->rotation_id;
            if (! $rotationId) return 'record:'.$assessment->id;

            $prefix = implode(':', [$rotationId, $assessment->student_id, $assessment->evaluator_person_id ?? 0]);
            if ($assessment->assessment_kind === 'period' && $assessment->week_start && $assessment->week_end) {
                return $prefix.':period:'.$assessment->week_start->toDateString().':'.$assessment->week_end->toDateString();
            }
            if ($assessment->evaluation_week !== null) {
                return $prefix.':weekly:'.$assessment->evaluation_week;
            }

            return 'record:'.$assessment->id;
        })->values();
    }

    /** @param Collection<int, StudentClinicalAssignment> $assignments */
    public function miniScoresForAssignments(Collection $assignments): Collection
    {
        if ($assignments instanceof \Illuminate\Database\Eloquent\Collection) {
            $assignments->loadMissing('rotationBlock');
        }
        $studentIds = $assignments->pluck('student_id')->filter()->unique()->values();
        $rotationIds = $assignments->map(fn (StudentClinicalAssignment $assignment) => $assignment->rotationBlock?->rotation_id)
            ->filter()->unique()->values();
        if ($studentIds->isEmpty() || $rotationIds->isEmpty()) return collect();

        return DB::table('clinical_mini_osce_scores as scores')
            ->join('rotation_blocks as blocks', 'blocks.id', '=', 'scores.rotation_block_id')
            ->whereIn('scores.student_id', $studentIds)
            ->whereIn('blocks.rotation_id', $rotationIds)
            ->orderBy('scores.id')
            ->get(['scores.*', 'blocks.rotation_id', 'blocks.from_week', 'blocks.to_week']);
    }

    public function miniForPeriod(Collection $scores, int $studentId, int $rotationId, int $startWeek, int $endWeek): ?object
    {
        return $scores->first(fn (object $score) => (int) $score->student_id === $studentId
            && (int) $score->rotation_id === $rotationId
            && (int) $score->from_week <= $endWeek
            && (int) $score->to_week >= $startWeek);
    }
}
