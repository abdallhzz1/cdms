<?php

namespace App\Services\Distribution;

use App\Models\AuditLog;
use App\Models\ClinicalAssessment;
use App\Models\DistributionVersion;
use App\Models\StudentClinicalAssignment;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Keeps recorded clinical marks visible when a distribution revision is published. */
class ClinicalScorePublicationGuard
{
    /** Must run inside the publication transaction after version rows are locked. */
    public function transfer(DistributionVersion $old, DistributionVersion $next, int $actorId): array
    {
        $oldAssignments = StudentClinicalAssignment::query()->where('distribution_version_id', $old->id)
            ->get()->keyBy('id');
        $nextAssignments = StudentClinicalAssignment::query()->where('distribution_version_id', $next->id)
            ->get()->groupBy(fn (StudentClinicalAssignment $item) => $this->key($item));
        $assessments = ClinicalAssessment::query()
            ->whereIn('student_clinical_assignment_id', $oldAssignments->keys())
            ->whereNotNull('score')->lockForUpdate()->get();
        $miniScores = DB::table('clinical_mini_osce_scores')
            ->where('distribution_version_id', $old->id)->lockForUpdate()->get();

        $assessmentMoves = [];
        $miniMoves = [];
        $conflicts = [];
        $slots = [];
        foreach ($assessments as $mark) {
            $source = $oldAssignments->get($mark->student_clinical_assignment_id);
            $matches = $source ? $nextAssignments->get($this->key($source), collect()) : collect();
            $target = $matches->count() === 1 ? $matches->first() : null;
            $slot = implode(':', [$mark->student_id, $mark->evaluator_person_id,
                $mark->assessment_kind, $mark->evaluation_week ?? ('block-'.$source?->rotation_block_id)]);
            $reason = null;
            if (! $source || (int) $source->student_id !== (int) $mark->student_id
                || (int) $source->supervisor_id !== (int) $mark->evaluator_person_id) {
                $reason = 'source_mismatch';
            } elseif (! $target) {
                $reason = $matches->count() > 1 ? 'ambiguous_target' : 'assignment_changed';
            } elseif ($mark->assessment_kind === 'weekly' && ($mark->evaluation_week === null
                || ! $this->weekInBlock($target, (int) $mark->evaluation_week))) {
                $reason = 'week_outside_target';
            } elseif (isset($slots[$slot])) {
                $reason = 'duplicate_old_slot';
            } elseif (ClinicalAssessment::query()->where('student_id', $mark->student_id)
                ->where('evaluator_person_id', $mark->evaluator_person_id)
                ->where('assessment_kind', $mark->assessment_kind)
                ->where('evaluation_week', $mark->evaluation_week)
                ->whereHas('clinicalAssignment', fn ($query) => $query
                    ->where('distribution_version_id', $next->id))
                ->exists()) {
                $reason = 'target_mark_exists';
            }
            if ($reason) {
                $conflicts[] = "تقييم #{$mark->id} (طالب #{$mark->student_id}، ".($mark->evaluation_week ? "أسبوع {$mark->evaluation_week}" : 'فترة تدريب').'): '.$this->reason($reason);
            } else {
                $slots[$slot] = true;
                $assessmentMoves[] = [$mark, $target];
            }
        }

        foreach ($miniScores as $score) {
            $sources = $oldAssignments->filter(fn (StudentClinicalAssignment $item) =>
                (int) $item->student_id === (int) $score->student_id
                && (int) $item->rotation_block_id === (int) $score->rotation_block_id
                && (int) $item->supervisor_id === (int) $score->entered_by_person_id);
            $source = $sources->count() === 1 ? $sources->first() : null;
            $matches = $source ? $nextAssignments->get($this->key($source), collect()) : collect();
            $target = $matches->count() === 1 ? $matches->first() : null;
            $reason = null;
            if (! $source) {
                $reason = 'source_mismatch';
            } elseif (! $target) {
                $reason = $matches->count() > 1 ? 'ambiguous_target' : 'assignment_changed';
            } elseif (DB::table('clinical_mini_osce_scores')
                ->where('student_id', $score->student_id)
                ->where('rotation_block_id', $score->rotation_block_id)
                ->where('distribution_version_id', $next->id)
                ->exists()) {
                $reason = 'target_mark_exists';
            }
            if ($reason) {
                $conflicts[] = "ميني أوسكي #{$score->id} (طالب #{$score->student_id}): ".$this->reason($reason);
            } else {
                $miniMoves[] = $score;
            }
        }

        if ($conflicts) {
            // Never publish a revision that would silently hide even one recorded mark.
            throw ValidationException::withMessages(['clinical_scores' => array_merge([
                'تعذر نشر التوزيع: توجد علامات سريرية أو ميني أوسكي سيتغير تكليفها أو تتكرر. راجع الحالات التالية أولاً؛ لم يتغير أي سجل.'
            ], array_slice($conflicts, 0, 20), count($conflicts) > 20 ? ['...and '.(count($conflicts) - 20).' more'] : [])]);
        }

        foreach ($assessmentMoves as [$mark, $target]) {
            $fromAssignmentId = $mark->student_clinical_assignment_id;
            $mark->student_clinical_assignment_id = $target->id;
            $mark->save();
            AuditLog::create([
                'user_id' => $actorId, 'action' => 'assessment.assignment_relinked',
                'entity_type' => ClinicalAssessment::class, 'entity_id' => $mark->id,
                'distribution_version_id' => $next->id, 'student_id' => $mark->student_id,
                'changes' => ['from_version_id' => $old->id, 'to_version_id' => $next->id,
                    'from_assignment_id' => $fromAssignmentId, 'to_assignment_id' => $target->id,
                    'reason' => 'unchanged_assignment_at_publication'],
                'is_override' => false,
            ]);
        }
        foreach ($miniMoves as $score) {
            DB::table('clinical_mini_osce_scores')->where('id', $score->id)
                ->update(['distribution_version_id' => $next->id, 'updated_at' => now()]);
            AuditLog::create([
                'user_id' => $actorId, 'action' => 'grade.mini_osce.version_relinked',
                'entity_type' => 'clinical_mini_osce_scores', 'entity_id' => $score->id,
                'distribution_version_id' => $next->id, 'student_id' => $score->student_id,
                'changes' => ['from_version_id' => $old->id, 'to_version_id' => $next->id,
                    'rotation_block_id' => $score->rotation_block_id,
                    'entered_by_person_id' => $score->entered_by_person_id,
                    'reason' => 'unchanged_assignment_at_publication'],
                'is_override' => false,
            ]);
        }

        return ['assessments' => count($assessmentMoves), 'mini_osce' => count($miniMoves)];
    }

    private function key(StudentClinicalAssignment $assignment): string
    {
        return json_encode([$assignment->student_id, $assignment->supervisor_id,
            $assignment->rotation_block_id, $assignment->training_site_id,
            $assignment->student_subgroup_id, $assignment->department_id], JSON_THROW_ON_ERROR);
    }

    private function weekInBlock(StudentClinicalAssignment $assignment, int $week): bool
    {
        $block = $assignment->rotationBlock()->first();
        return $block && $week >= $block->from_week && $week <= $block->to_week;
    }

    private function reason(string $code): string
    {
        return match ($code) {
            'source_mismatch' => 'التكليف القديم لا يطابق الطالب أو المشرف الذي أدخل العلامة',
            'ambiguous_target' => 'أكثر من تكليف مطابق في النسخة الجديدة',
            'assignment_changed' => 'تغيّر المشرف أو المجموعة أو المركز أو الفترة',
            'week_outside_target' => 'الأسبوع خارج تكليف النسخة الجديدة',
            'duplicate_old_slot' => 'علامتان قديمتان لنفس الطالب والموعد',
            'target_mark_exists' => 'توجد علامة في النسخة الجديدة؛ يلزم مراجعة التعارض',
            default => $code,
        };
    }
}
