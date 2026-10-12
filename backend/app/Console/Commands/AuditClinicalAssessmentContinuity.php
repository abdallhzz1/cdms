<?php

namespace App\Console\Commands;

use App\Models\ClinicalAssessment;
use App\Models\DistributionVersion;
use App\Models\StudentClinicalAssignment;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/** Read-only audit of official marks left on superseded distributions. */
class AuditClinicalAssessmentContinuity extends Command
{
    protected $signature = 'clinical:audit-assessment-continuity {--details : Include intentionally changed assignments}';
    protected $description = 'Find clinical and mini-OSCE marks hidden by distribution revisions without changing data.';

    public function handle(): int
    {
        $current = DistributionVersion::query()->where('status', 'published')->where('is_current', true)
            ->get(['id', 'rotation_id'])->groupBy('rotation_id');
        $old = DistributionVersion::query()->where('status', 'published')->where('is_current', false)
            ->get(['id', 'rotation_id'])->keyBy('id');
        $oldAssignments = StudentClinicalAssignment::query()->whereIn('distribution_version_id', $old->keys())
            ->get()->keyBy('id');
        $currentAssignments = StudentClinicalAssignment::query()
            ->whereIn('distribution_version_id', $current->flatten()->pluck('id'))
            ->get()->groupBy('distribution_version_id');
        $rows = [];
        $counts = ['hidden_unchanged' => 0, 'changed_assignment' => 0, 'current_mark_exists' => 0, 'no_unique_current_version' => 0];

        $marks = ClinicalAssessment::query()->whereIn('student_clinical_assignment_id', $oldAssignments->keys())
            ->whereIn('status', ['submitted', 'approved'])->whereNotNull('score')
            ->orderBy('id')->get();
        foreach ($marks as $mark) {
            $source = $oldAssignments->get($mark->student_clinical_assignment_id);
            $sourceVersion = $old->get($source?->distribution_version_id);
            $versions = $current->get($sourceVersion?->rotation_id, collect());
            $targets = $versions->count() === 1 ? $currentAssignments->get($versions->first()->id, collect()) : collect();
            $matching = $source ? $targets->filter(fn (StudentClinicalAssignment $item) => $this->key($item) === $this->key($source)) : collect();
            $target = $matching->count() === 1 ? $matching->first() : null;
            if ($versions->count() !== 1) $reason = 'no_unique_current_version';
            elseif (! $target || (int) $source->student_id !== (int) $mark->student_id
                || (int) $source->supervisor_id !== (int) $mark->evaluator_person_id) $reason = 'changed_assignment';
            else {
                $exists = ClinicalAssessment::query()->where('student_id', $mark->student_id)
                    ->where('evaluator_person_id', $mark->evaluator_person_id)
                    ->where('assessment_kind', $mark->assessment_kind)
                    ->where('evaluation_week', $mark->evaluation_week)
                    ->whereHas('clinicalAssignment', fn ($query) => $query
                        ->where('distribution_version_id', $versions->first()->id))->exists();
                $reason = $exists ? 'current_mark_exists' : 'hidden_unchanged';
            }
            $counts[$reason]++;
            if ($reason === 'hidden_unchanged' || $this->option('details')) {
                $rows[] = ['assessment', $mark->id, $mark->student_id, $mark->evaluator_person_id,
                    $mark->evaluation_week ?? 'period', $source?->distribution_version_id, $versions->first()?->id, $reason];
            }
        }

        $mini = DB::table('clinical_mini_osce_scores')->whereIn('distribution_version_id', $old->keys())->orderBy('id')->get();
        foreach ($mini as $score) {
            $sourceVersion = $old->get($score->distribution_version_id);
            $versions = $current->get($sourceVersion?->rotation_id, collect());
            $sources = $oldAssignments->filter(fn (StudentClinicalAssignment $item) =>
                (int) $item->distribution_version_id === (int) $score->distribution_version_id
                && (int) $item->student_id === (int) $score->student_id
                && (int) $item->rotation_block_id === (int) $score->rotation_block_id
                && (int) $item->supervisor_id === (int) $score->entered_by_person_id);
            $source = $sources->count() === 1 ? $sources->first() : null;
            $targets = $versions->count() === 1 ? $currentAssignments->get($versions->first()->id, collect()) : collect();
            $matching = $source ? $targets->filter(fn (StudentClinicalAssignment $item) => $this->key($item) === $this->key($source)) : collect();
            if ($versions->count() !== 1) $reason = 'no_unique_current_version';
            elseif ($matching->count() !== 1) $reason = 'changed_assignment';
            else {
                $exists = DB::table('clinical_mini_osce_scores')
                    ->where('distribution_version_id', $versions->first()->id)
                    ->where('student_id', $score->student_id)
                    ->where('rotation_block_id', $score->rotation_block_id)->exists();
                $reason = $exists ? 'current_mark_exists' : 'hidden_unchanged';
            }
            $counts[$reason]++;
            if ($reason === 'hidden_unchanged' || $this->option('details')) {
                $rows[] = ['mini_osce', $score->id, $score->student_id, $score->entered_by_person_id,
                    '-', $score->distribution_version_id, $versions->first()?->id, $reason];
            }
        }

        $this->table(['Type', 'Mark ID', 'Student ID', 'Supervisor ID', 'Week', 'Old version', 'Current version', 'Finding'], $rows);
        $this->line('Hidden with unchanged assignment: '.$counts['hidden_unchanged']
            .' | Changed assignment: '.$counts['changed_assignment']
            .' | Replaced by current mark: '.$counts['current_mark_exists']
            .' | No unique current version: '.$counts['no_unique_current_version']);
        $this->info('Read-only audit. No marks or distributions were changed.');

        return $counts['hidden_unchanged'] > 0 ? self::FAILURE : self::SUCCESS;
    }

    private function key(StudentClinicalAssignment $item): string
    {
        return json_encode([$item->student_id, $item->supervisor_id, $item->rotation_block_id,
            $item->training_site_id, $item->student_subgroup_id, $item->department_id], JSON_THROW_ON_ERROR);
    }
}
