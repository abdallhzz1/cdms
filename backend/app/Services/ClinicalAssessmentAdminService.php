<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\ClinicalAssessment;
use App\Models\DistributionVersion;
use App\Models\GradeEntry;
use App\Models\StudentClinicalAssignment;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Conservative, audited administrative repairs; never silently select a conflicting mark. */
class ClinicalAssessmentAdminService
{
    public function fingerprint(string $type, int $id): string
    {
        if ($type === 'clinical') {
            $record = DB::table('clinical_assessments')->where('id', $id)->first();
            $assignment = $record ? DB::table('student_clinical_assignments')
                ->where('id', $record->student_clinical_assignment_id)->first() : null;
            $version = $assignment ? DB::table('distribution_versions')
                ->where('id', $assignment->distribution_version_id)->first() : null;
            $payload = [$record, $assignment, $version];
        } elseif ($type === 'mini_osce') {
            $record = DB::table('clinical_mini_osce_scores')->where('id', $id)->first();
            $version = $record ? DB::table('distribution_versions')
                ->where('id', $record->distribution_version_id)->first() : null;
            $payload = [$record, $version];
        } elseif ($type === 'final_osce') {
            $payload = [DB::table('grade_entries')->where('id', $id)->first()];
        } else {
            abort(404);
        }
        abort_unless($payload[0], 404);
        return hash('sha256', json_encode($payload, JSON_THROW_ON_ERROR));
    }

    private function assignmentKey(StudentClinicalAssignment $assignment): string
    {
        return json_encode([
            $assignment->student_id, $assignment->supervisor_id, $assignment->rotation_block_id,
            $assignment->training_site_id, $assignment->student_subgroup_id, $assignment->department_id,
        ], JSON_THROW_ON_ERROR);
    }

    /** @return array{reason: ?string, target: ?StudentClinicalAssignment, current_version_id: ?int} */
    public function restorePlan(ClinicalAssessment $mark): array
    {
        $mark->loadMissing('clinicalAssignment.distributionVersion', 'clinicalAssignment.rotationBlock.rotation');
        $source = $mark->clinicalAssignment;
        $version = $source?->distributionVersion;
        $rotation = $source?->rotationBlock?->rotation;
        if (! $source || ! $version || ! $rotation) return ['reason' => 'missing_assignment', 'target' => null, 'current_version_id' => null];
        if ($version->status !== 'published' || $version->is_current) return ['reason' => 'not_historical_published', 'target' => null, 'current_version_id' => null];
        $versions = DistributionVersion::query()->where('rotation_id', $rotation->id)
            ->where('status', 'published')->where('is_current', true)->get();
        if ($versions->count() !== 1) return ['reason' => 'no_unique_current_version', 'target' => null, 'current_version_id' => null];
        $currentId = (int) $versions->first()->id;
        $result = ['reason' => null, 'target' => null, 'current_version_id' => $currentId];
        if (! in_array($mark->status, ['submitted', 'approved'], true) || $mark->score === null) {
            $result['reason'] = 'not_official';
        } elseif ((int) $source->student_id !== (int) $mark->student_id
            || (int) $source->supervisor_id !== (int) $mark->evaluator_person_id) {
            $result['reason'] = 'old_assignment_mismatch';
        } elseif ($mark->assessment_kind === 'weekly' && ($mark->evaluation_week === null
            || $mark->evaluation_week < $source->rotationBlock->from_week
            || $mark->evaluation_week > $source->rotationBlock->to_week)) {
            $result['reason'] = 'week_outside_assignment';
        } elseif ($mark->assessment_kind === 'period' && (! $mark->week_start || ! $mark->week_end
            || $mark->week_start->gt($mark->week_end))) {
            $result['reason'] = 'period_dates_missing';
        }
        if ($result['reason']) return $result;

        $matches = StudentClinicalAssignment::query()->where('distribution_version_id', $currentId)
            ->where('student_id', $mark->student_id)->get()
            ->filter(fn (StudentClinicalAssignment $item) => $this->assignmentKey($item) === $this->assignmentKey($source));
        if ($matches->count() !== 1) {
            $result['reason'] = $matches->isEmpty() ? 'assignment_changed' : 'ambiguous_current_assignment';
            return $result;
        }
        $target = $matches->first();
        $result['target'] = $target;
        $currentPeer = ClinicalAssessment::query()->where('student_id', $mark->student_id)
            ->where('evaluator_person_id', $mark->evaluator_person_id)
            ->where('assessment_kind', $mark->assessment_kind)
            ->where('evaluation_week', $mark->evaluation_week)
            ->whereHas('clinicalAssignment', fn ($query) => $query
                ->where('distribution_version_id', $currentId)
                ->whereHas('rotationBlock', fn ($block) => $block->where('rotation_id', $rotation->id)))
            ->when($mark->assessment_kind === 'period', fn ($query) => $query
                ->whereDate('week_start', '<=', $mark->week_end?->toDateString())
                ->whereDate('week_end', '>=', $mark->week_start?->toDateString()))
            ->exists();
        if ($currentPeer) {
            $result['reason'] = 'current_assessment_exists';
            return $result;
        }

        // A matching historical peer means the administrator must decide which
        // one is authoritative. The API cannot guess from submission time.
        $oldPeers = ClinicalAssessment::query()->whereKeyNot($mark->id)
            ->where('student_id', $mark->student_id)->where('evaluator_person_id', $mark->evaluator_person_id)
            ->where('assessment_kind', $mark->assessment_kind)->where('evaluation_week', $mark->evaluation_week)
            ->when($mark->assessment_kind === 'period', fn ($query) => $query
                ->whereDate('week_start', '<=', $mark->week_end->toDateString())
                ->whereDate('week_end', '>=', $mark->week_start->toDateString()))
            ->whereIn('status', ['submitted', 'approved'])->whereNotNull('score')
            ->whereHas('clinicalAssignment.rotationBlock', fn ($block) => $block->where('rotation_id', $rotation->id))
            ->with('clinicalAssignment')->get();
        if ($oldPeers->contains(fn (ClinicalAssessment $other) => $other->clinicalAssignment
            && $this->assignmentKey($other->clinicalAssignment) === $this->assignmentKey($source))) {
            $result['reason'] = 'ambiguous_old_assessments';
        }
        return $result;
    }

    /** @return array{reason: ?string, current_version_id: ?int} */
    public function miniRestorePlan(object $mini): array
    {
        $sourceVersion = DistributionVersion::query()->find($mini->distribution_version_id);
        if (! $sourceVersion || $sourceVersion->status !== 'published' || $sourceVersion->is_current)
            return ['reason' => 'not_historical_published', 'current_version_id' => null];
        $versions = DistributionVersion::query()->where('rotation_id', $sourceVersion->rotation_id)
            ->where('status', 'published')->where('is_current', true)->get();
        if ($versions->count() !== 1) return ['reason' => 'no_unique_current_version', 'current_version_id' => null];
        $currentId = (int) $versions->first()->id;
        $sources = StudentClinicalAssignment::query()->where('distribution_version_id', $sourceVersion->id)
            ->where('student_id', $mini->student_id)->where('rotation_block_id', $mini->rotation_block_id)
            ->where('supervisor_id', $mini->entered_by_person_id)->get();
        if ($sources->count() !== 1) return ['reason' => 'ambiguous_source_assignment', 'current_version_id' => $currentId];
        $source = $sources->first();
        $targets = StudentClinicalAssignment::query()->where('distribution_version_id', $currentId)
            ->where('student_id', $mini->student_id)->get()
            ->filter(fn (StudentClinicalAssignment $item) => $this->assignmentKey($item) === $this->assignmentKey($source));
        if ($targets->count() !== 1) return ['reason' => $targets->isEmpty() ? 'assignment_changed' : 'ambiguous_current_assignment', 'current_version_id' => $currentId];
        $peer = DB::table('clinical_mini_osce_scores')->where('student_id', $mini->student_id)
            ->where('rotation_block_id', $mini->rotation_block_id)
            ->where('distribution_version_id', $currentId)->exists();
        if ($peer) return ['reason' => 'current_assessment_exists', 'current_version_id' => $currentId];
        $historicalPeers = DB::table('clinical_mini_osce_scores')->where('id', '<>', $mini->id)
            ->where('student_id', $mini->student_id)->where('rotation_block_id', $mini->rotation_block_id)
            ->where('entered_by_person_id', $mini->entered_by_person_id)->exists();
        return ['reason' => $historicalPeers ? 'ambiguous_old_assessments' : null, 'current_version_id' => $currentId];
    }

    public function syncGrade(int $studentId, int $courseId, int $academicYearId, User $actor, string $reason, bool $acknowledgeApproved): void
    {
        $grade = GradeEntry::query()->whereHas('enrollment', fn ($query) => $query
            ->where('student_id', $studentId)->where('course_id', $courseId)
            ->where('academic_year_id', $academicYearId))->lockForUpdate()->first();
        if (! $grade) return;
        if ($grade->status === 'approved' && ! $acknowledgeApproved) {
            throw ValidationException::withMessages(['acknowledge_approved_grade' => ['An approved grade sheet exists. Confirm its amendment explicitly.']]);
        }
        $clinical = app(ClinicalGradeCalculator::class)->scores([$studentId], $courseId, $academicYearId)->get($studentId);
        if ($clinical === null && in_array($grade->status, ['submitted', 'approved'], true)) {
            throw ValidationException::withMessages(['grade' => ['The clinical total cannot be recalculated. No records changed.']]);
        }
        $old = ['clinical_score' => $grade->clinical_score, 'score' => $grade->score, 'status' => $grade->status];
        $grade->clinical_score = $clinical;
        $grade->score = $clinical === null || $grade->osce_score === null || $grade->written_score === null
            ? null : round((float) $clinical + (float) $grade->osce_score + (float) $grade->written_score, 2);
        $grade->save();
        AuditLog::create([
            'user_id' => $actor->id, 'action' => 'grade.admin_clinical_resynced',
            'entity_type' => GradeEntry::class, 'entity_id' => $grade->id, 'student_id' => $studentId,
            'changes' => ['before' => $old, 'after' => ['clinical_score' => $grade->clinical_score, 'score' => $grade->score, 'status' => $grade->status]],
            'is_override' => true, 'override_reason' => $reason,
        ]);
    }

    public function audit(User $actor, string $action, string $entityType, int $entityId, int $studentId, ?int $versionId, array $changes, string $reason): void
    {
        AuditLog::create([
            'user_id' => $actor->id, 'action' => $action, 'entity_type' => $entityType,
            'entity_id' => $entityId, 'distribution_version_id' => $versionId,
            'student_id' => $studentId, 'changes' => $changes,
            'is_override' => true, 'override_reason' => $reason,
        ]);
    }
}
