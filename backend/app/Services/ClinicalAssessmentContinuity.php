<?php

namespace App\Services;

use App\Models\ClinicalAssessment;
use App\Models\StudentClinicalAssignment;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/** Selects current clinical assessments without changing historical audit records. */
class ClinicalAssessmentContinuity
{
    /** @param Collection<int, StudentClinicalAssignment> $assignments */
    public function forAssignments(Collection $assignments): Builder
    {
        $assignmentIds = $assignments->pluck('id')->filter()->unique()->values();
        $query = ClinicalAssessment::query();
        if ($assignmentIds->isEmpty()) {
            return $query->whereRaw('1 = 0');
        }

        return $query->whereIn('student_clinical_assignment_id', $assignmentIds)
            ->whereHas('clinicalAssignment.distributionVersion', fn (Builder $version) => $version
                ->where('status', 'published')->where('is_current', true))
            ->whereHas('clinicalAssignment', fn (Builder $assignment) => $assignment
                ->whereColumn('student_clinical_assignments.student_id', 'clinical_assessments.student_id')
                ->whereColumn('student_clinical_assignments.supervisor_id', 'clinical_assessments.evaluator_person_id'));
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
        $currentAssignmentIds = StudentClinicalAssignment::query()
            ->where('distribution_version_id', $assignment->distribution_version_id)
            ->where('student_id', $studentId)
            ->where('supervisor_id', $evaluatorId)
            ->whereHas('rotationBlock', fn (Builder $block) => $block
                ->where('rotation_id', $assignment->rotationBlock?->rotation_id))
            ->pluck('id');
        $query = ClinicalAssessment::query()
            ->whereIn('student_clinical_assignment_id', $currentAssignmentIds)
            ->where('student_id', $studentId)
            ->where('evaluator_person_id', $evaluatorId)
            ->where('assessment_kind', $kind)
            ->where('evaluation_week', $week);

        // A course can contain several separate training periods.
        if ($kind === 'period') {
            $query->whereDate('week_start', '<=', $end->toDateString())
                ->whereDate('week_end', '>=', $start->toDateString());
        }

        return $query;
    }

    /**
     * Count the latest official mark for a logical slot if current-version assignments overlap;
     * never delete or silently rewrite the other audit records.
     *
     * @param Collection<int, ClinicalAssessment> $assessments
     * @return Collection<int, ClinicalAssessment>
     */
    public function distinctOfficial(Collection $assessments): Collection
    {
        return $assessments->sortByDesc('id')->unique(fn (ClinicalAssessment $assessment) => $this->slotKey($assessment))->values();
    }

    /** @param Collection<int, ClinicalAssessment> $assessments */
    public function distinctForReview(Collection $assessments): Collection
    {
        return $assessments->sort(function (ClinicalAssessment $first, ClinicalAssessment $second): int {
            $firstOfficial = in_array($first->status, ['submitted', 'approved'], true) ? 1 : 0;
            $secondOfficial = in_array($second->status, ['submitted', 'approved'], true) ? 1 : 0;

            return $secondOfficial <=> $firstOfficial ?: $second->id <=> $first->id;
        })->unique(fn (ClinicalAssessment $assessment) => $this->slotKey($assessment))
            ->sortBy('id')->values();
    }

    private function slotKey(ClinicalAssessment $assessment): string
    {
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
    }

    /** @param Collection<int, StudentClinicalAssignment> $assignments */
    public function miniScoresForAssignments(Collection $assignments): Collection
    {
        $assignmentIds = $assignments->pluck('id')->filter()->unique()->values();
        if ($assignmentIds->isEmpty()) return collect();

        return DB::table('clinical_mini_osce_scores as scores')
            ->join('rotation_blocks as blocks', 'blocks.id', '=', 'scores.rotation_block_id')
            ->whereExists(fn ($query) => $query->selectRaw('1')
                ->from('student_clinical_assignments as assigned')
                ->join('distribution_versions as versions', 'versions.id', '=', 'assigned.distribution_version_id')
                ->whereIn('assigned.id', $assignmentIds)
                ->where('versions.status', 'published')->where('versions.is_current', true)
                ->whereColumn('assigned.student_id', 'scores.student_id')
                ->whereColumn('assigned.rotation_block_id', 'scores.rotation_block_id')
                ->whereColumn('assigned.distribution_version_id', 'scores.distribution_version_id')
                ->whereColumn('assigned.supervisor_id', 'scores.entered_by_person_id'))
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
