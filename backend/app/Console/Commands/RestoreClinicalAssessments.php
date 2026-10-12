<?php

namespace App\Console\Commands;

use App\Models\AuditLog;
use App\Models\ClinicalAssessment;
use App\Models\DistributionVersion;
use App\Models\GradeEntry;
use App\Models\Person;
use App\Models\StudentClinicalAssignment;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/** Explicit, audited recovery when an unchanged assignment was copied into a new distribution. */
class RestoreClinicalAssessments extends Command
{
    protected $signature = 'clinical:restore-assessments
        {email : University email of the evaluator}
        {from-version : Superseded distribution version ID}
        {to-version : Current published distribution version ID}
        {--apply : Relink eligible records after a successful preview}
        {--expect= : Exact number of records required before any write}
        {--actor-email= : Existing active administrator account for the audit trail}';

    protected $description = 'Preview or restore submitted clinical assessments for unchanged assignments across a distribution revision.';

    public function handle(): int
    {
        $people = Person::query()->whereRaw('LOWER(email) = ?', [mb_strtolower((string) $this->argument('email'))])->limit(2)->get();
        $person = $people->count() === 1 ? $people->first() : null;
        $from = DistributionVersion::query()->find($this->argument('from-version'));
        $to = DistributionVersion::query()->find($this->argument('to-version'));
        if (! $person || ! $from || ! $to || $from->id === $to->id
            || (int) $from->rotation_id !== (int) $to->rotation_id
            || $from->status !== 'published' || $from->is_current
            || $to->status !== 'published' || ! $to->is_current
            || (int) $to->source_version_id !== (int) $from->id) {
            $this->error('Evaluator or direct published revision is invalid. No records changed.');
            return self::FAILURE;
        }

        if (! $this->option('apply')) {
            $this->displayPlan($this->plan($person, $from, $to));
            $this->info('Preview only. No assessments were changed.');
            return self::SUCCESS;
        }

        $expected = filter_var($this->option('expect'), FILTER_VALIDATE_INT);
        $actorEmail = trim((string) $this->option('actor-email'));
        $actors = $actorEmail !== ''
            ? User::query()->whereRaw('LOWER(email) = ?', [mb_strtolower($actorEmail)])->limit(2)->get()
            : collect();
        $actor = $actors->count() === 1 ? $actors->first() : null;
        if ($expected === false || $expected < 1 || ! $actor || ! $actor->is_active) {
            $this->error('Apply requires --expect=N (N > 0) and --actor-email for an active user. No records changed.');
            return self::FAILURE;
        }

        try {
            $result = DB::transaction(function () use ($person, $from, $to, $actor, $expected): array {
                DistributionVersion::query()->whereIn('id', [$from->id, $to->id])->orderBy('id')->lockForUpdate()->get();
                $from->refresh();
                $to->refresh();
                if ($from->is_current || ! $to->is_current || $from->status !== 'published' || $to->status !== 'published') {
                    throw new RuntimeException('Distribution changed since preview.');
                }
                $plan = $this->plan($person, $from, $to, true);
                if ($plan->count() !== $expected || $plan->contains(fn (array $row) => $row['reason'] !== null)) {
                    throw new RuntimeException('Expected count or assignment checks failed; nothing was restored.');
                }

                foreach ($plan as $row) {
                    /** @var ClinicalAssessment $assessment */
                    $assessment = $row['assessment'];
                    /** @var StudentClinicalAssignment $target */
                    $target = $row['target'];
                    $oldAssignmentId = (int) $assessment->student_clinical_assignment_id;
                    $assessment->student_clinical_assignment_id = $target->id;
                    $assessment->save();
                    AuditLog::create([
                        'user_id' => $actor->id,
                        'action' => 'assessment.assignment_relinked',
                        'entity_type' => ClinicalAssessment::class,
                        'entity_id' => $assessment->id,
                        'distribution_version_id' => $to->id,
                        'student_id' => $assessment->student_id,
                        'changes' => [
                            'from_version_id' => $from->id,
                            'to_version_id' => $to->id,
                            'from_assignment_id' => $oldAssignmentId,
                            'to_assignment_id' => $target->id,
                            'evaluator_person_id' => $person->id,
                            'assessment_kind' => $assessment->assessment_kind,
                            'evaluation_week' => $assessment->evaluation_week,
                            'submitted_at' => $assessment->submitted_at?->toDateTimeString(),
                        ],
                        'is_override' => false,
                    ]);
                }

                return ['count' => $plan->count(), 'ids' => $plan->pluck('assessment.id')->all()];
            });
        } catch (\Throwable $e) {
            $this->error($e->getMessage().' No records changed.');
            return self::FAILURE;
        }

        $this->info("Restored {$result['count']} assessments with audit logs. Assessment IDs: ".implode(', ', $result['ids']));
        return self::SUCCESS;
    }

    /** @return Collection<int, array{assessment: ClinicalAssessment, target: ?StudentClinicalAssignment, reason: ?string}> */
    private function plan(Person $person, DistributionVersion $from, DistributionVersion $to, bool $lock = false): Collection
    {
        $targets = StudentClinicalAssignment::query()->where('distribution_version_id', $to->id)
            ->get()->groupBy(fn (StudentClinicalAssignment $item) => $this->assignmentKey($item));
        $query = ClinicalAssessment::query()
            ->where('evaluator_person_id', $person->id)
            ->whereHas('clinicalAssignment', fn ($assignment) => $assignment->where('distribution_version_id', $from->id))
            ->with(['clinicalAssignment.rotationBlock.rotation', 'student:id,university_number'])
            ->orderBy('id');
        if ($lock) $query->lockForUpdate();

        $rows = $query->get()->map(function (ClinicalAssessment $assessment) use ($targets, $person, $to): array {
            $old = $assessment->clinicalAssignment;
            $matches = $old ? $targets->get($this->assignmentKey($old), collect()) : collect();
            $target = $matches->count() === 1 ? $matches->first() : null;
            $reason = null;
            if (! in_array($assessment->status, ['submitted', 'approved'], true) || $assessment->score === null) {
                $reason = 'not_official';
            } elseif (! $old || (int) $old->student_id !== (int) $assessment->student_id
                || (int) $old->supervisor_id !== (int) $person->id) {
                $reason = 'old_assignment_mismatch';
            } elseif (! $target) {
                $reason = $matches->isEmpty() ? 'assignment_changed' : 'ambiguous_current_assignment';
            } elseif (! $old->rotationBlock || ($assessment->assessment_kind === 'weekly'
                && (! $assessment->evaluation_week
                    || $assessment->evaluation_week < $old->rotationBlock->from_week
                    || $assessment->evaluation_week > $old->rotationBlock->to_week))) {
                $reason = 'week_outside_assignment';
            } elseif (ClinicalAssessment::query()
                ->where('student_id', $assessment->student_id)
                ->where('evaluator_person_id', $person->id)
                ->where('assessment_kind', $assessment->assessment_kind)
                ->where('evaluation_week', $assessment->evaluation_week)
                ->whereHas('clinicalAssignment', fn ($assignment) => $assignment
                    ->where('distribution_version_id', $to->id)
                    ->where('student_id', $assessment->student_id)
                    ->whereHas('rotationBlock', fn ($block) => $block
                        ->where('rotation_id', $old->rotationBlock->rotation_id)
                        ->when($assessment->evaluation_week !== null, fn ($weeks) => $weeks
                            ->where('from_week', '<=', $assessment->evaluation_week)
                            ->where('to_week', '>=', $assessment->evaluation_week))))
                ->exists()) {
                $reason = 'current_assessment_exists';
            } else {
                $rotation = $old->rotationBlock?->rotation;
                if (! $rotation || GradeEntry::query()->where('status', 'approved')
                    ->whereHas('enrollment', fn ($enrollment) => $enrollment
                        ->where('student_id', $assessment->student_id)
                        ->where('course_id', $rotation->course_id)
                        ->where('academic_year_id', $rotation->academic_year_id))->exists()) {
                    $reason = 'approved_grade_or_missing_rotation';
                }
            }

            return compact('assessment', 'target', 'reason');
        });

        // A version can contain duplicate source assignments. Never choose a
        // winner for two historical assessments targeting one logical slot.
        $duplicates = $rows->filter(fn (array $row) => $row['target'] !== null)
            ->groupBy(fn (array $row) => implode(':', [
                $row['target']->id, $row['assessment']->assessment_kind,
                $row['assessment']->evaluation_week ?? 'period', $row['assessment']->evaluator_person_id,
            ]))->filter(fn (Collection $group) => $group->count() > 1);
        if ($duplicates->isNotEmpty()) {
            $duplicateIds = $duplicates->flatten(1)->pluck('assessment.id')->all();
            $rows = $rows->map(function (array $row) use ($duplicateIds): array {
                if (in_array($row['assessment']->id, $duplicateIds, true)) $row['reason'] = 'ambiguous_old_assessments';
                return $row;
            });
        }

        return $rows;
    }

    private function assignmentKey(StudentClinicalAssignment $assignment): string
    {
        return json_encode([
            $assignment->student_id,
            $assignment->supervisor_id,
            $assignment->rotation_block_id,
            $assignment->training_site_id,
            $assignment->student_subgroup_id,
            $assignment->department_id,
        ], JSON_THROW_ON_ERROR);
    }

    private function displayPlan(Collection $plan): void
    {
        $this->table(['Assessment', 'Student', 'Week', 'Current assignment', 'Result'], $plan->map(fn (array $row) => [
            $row['assessment']->id,
            $row['assessment']->student?->university_number ?? $row['assessment']->student_id,
            $row['assessment']->evaluation_week ?? 'period',
            $row['target']?->id ?? '-',
            $row['reason'] ?? 'ELIGIBLE',
        ])->all());
        $this->line(sprintf('Found: %d | Eligible: %d | Blocked: %d',
            $plan->count(), $plan->whereNull('reason')->count(), $plan->whereNotNull('reason')->count()));
    }
}
