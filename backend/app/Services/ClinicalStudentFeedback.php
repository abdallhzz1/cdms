<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\ClinicalFeedbackWindow;
use App\Models\ClinicalMarkRelease;
use App\Models\Student;
use App\Models\StudentClinicalAssignment;
use App\Models\User;
use App\Services\Distribution\ClinicalScheduleDateCalculator;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ClinicalStudentFeedback
{
    /** Internal catalog; never serialize this collection to the student. */
    public function catalog(Student $student, ?Collection $assignments = null, ?Collection $windows = null, ?Collection $official = null): Collection
    {
        $windows ??= ClinicalFeedbackWindow::where('is_enabled', true)->with('rotation.course.assessmentComponents', 'rotation.clinicalPeriod', 'rotation.academicYear')->get()->keyBy('rotation_id');
        $assignments ??= StudentClinicalAssignment::where('student_id', $student->id)
            ->whereHas('distributionVersion', fn ($q) => $q->where('status', 'published')->where('is_current', true)->whereIn('rotation_id', $windows->keys()))
            ->with(['rotationBlock.rotation', 'distributionVersion.breaks', 'supervisor'])->get();
        $assignments = $assignments->filter(fn ($a) => (int) $a->student_id === (int) $student->id && $a->rotationBlock && (int) $a->rotationBlock->from_week >= 1 && (int) $a->rotationBlock->to_week <= 60 && (int) $a->rotationBlock->to_week >= (int) $a->rotationBlock->from_week);
        $continuity = app(ClinicalAssessmentContinuity::class);
        $official ??= $continuity->distinctOfficial($continuity->forAssignments($assignments)->whereIn('status', ['submitted', 'approved'])->whereNotNull('score')->where('max_score', '>', 0)->with('clinicalAssignment.rotationBlock')->get());
        $official = $official->where('student_id', $student->id);
        $slots = collect();
        foreach ($assignments->groupBy('rotationBlock.rotation_id') as $rotationId => $items) {
            $window = $windows->get($rotationId);
            $rotation = $window?->rotation;
            if (! $rotation?->start_date || ! $rotation->course || ! in_array($rotation->academic_level, ['fourth', 'fifth', 'sixth'], true)) {
                continue;
            }
            $periodMode = $rotation->course->assessmentComponents->firstWhere('code', 'clinical')?->assessment_frequency === 'period';
            $ranges = $periodMode ? app(ClinicalAssessmentPeriods::class)->groups($items, false)->map(fn ($p) => [$p['start_week'], $p['end_week']])
                : $items->flatMap(fn ($a) => range(max(1, (int) $a->rotationBlock->from_week), min(60, (int) $a->rotationBlock->to_week)))->unique()->map(fn ($week) => [$week, $week]);
            foreach ($ranges as [$from, $to]) {
                if ($from < 1 || $to < $from || $to > 60 || $to < $window->from_week) {
                    continue;
                }
                $active = $items->filter(fn ($a) => (int) $a->rotationBlock->from_week <= $to && (int) $a->rotationBlock->to_week >= $from);
                $breaks = $items->first()->distributionVersion->breaks;
                $dates = app(ClinicalScheduleDateCalculator::class);
                $start = $dates->calculateBlockStartDate($rotation->start_date, $from, $breaks);
                $end = $dates->calculateBlockEndDate($rotation->start_date, $to, $breaks);
                $kind = $periodMode ? 'period' : 'weekly';
                $slotKey = $periodMode ? 'period:'.$start.':'.$end : 'weekly:'.$from;
                $assessment = $official->first(function ($a) use ($rotationId, $kind, $from, $start, $end) {
                    return (int) $a->clinicalAssignment?->rotationBlock?->rotation_id === (int) $rotationId
                        && $a->assessment_kind === $kind
                        && ($kind === 'weekly' ? (int) $a->evaluation_week === $from : $a->week_start?->toDateString() === $start && $a->week_end?->toDateString() === $end);
                });
                $supervisorIds = $active->pluck('supervisor_id')->filter()->unique();
                $supervisor = $assessment?->evaluator_person_id ?: ($supervisorIds->count() === 1 ? $supervisorIds->first() : null);
                $slots->push([
                    'key' => hash_hmac('sha256', $student->id.'|'.$window->id.'|'.$slotKey, (string) config('app.key')),
                    'window' => $window, 'rotation' => $rotation, 'student_id' => $student->id, 'slot_key' => $slotKey,
                    'kind' => $kind, 'from_week' => $from, 'to_week' => $to, 'starts_on' => $start, 'ends_on' => $end,
                    'supervisor_id' => $supervisor, 'supervisor' => $active->firstWhere('supervisor_id', $supervisor)?->supervisor,
                    'assessment' => $assessment,
                ]);
            }
        }

        return $slots->unique('key')->values();
    }

    private function officialValid(array $slot): bool
    {
        $a = $slot['assessment'];

        return $a && $slot['supervisor_id'] && (float) $a->max_score > 0 && (float) $a->score >= 0 && (float) $a->score <= (float) $a->max_score;
    }

    private function snapshotMatches(array $slot, ?ClinicalMarkRelease $release): bool
    {
        $a = $slot['assessment'];

        return $release && $this->officialValid($slot) && (int) $release->assessment_id === (int) $a->id
            && (int) $release->supervisor_id === (int) $slot['supervisor_id']
            && abs((float) $release->score - (float) $a->score) < 0.005 && abs((float) $release->max_score - (float) $a->max_score) < 0.005;
    }

    public function forStudent(Student $student, ?Collection $participations = null): array
    {
        $releases = ClinicalMarkRelease::where('student_id', $student->id)->get()->keyBy(fn ($r) => $r->window_id.'|'.$r->slot_key);
        $participations ??= DB::table('clinical_feedback_participations')->where('student_id', $student->id)->get()->keyBy(fn ($p) => $p->window_id.'|'.$p->slot_key);
        $catalog = $this->catalog($student);
        $publications = DB::table('clinical_week_publications')->whereIn('window_id', $catalog->pluck('window.id')->unique())->get()->keyBy(fn ($p) => $p->window_id.'|'.$p->week);

        return $catalog->filter(fn ($s) => $publications->has($s['window']->id.'|'.$s['to_week']) || $releases->has($s['window']->id.'|'.$s['slot_key']))
            ->map(function ($s) use ($releases, $participations, $publications) {
                $key = $s['window']->id.'|'.$s['slot_key'];
                $done = $participations->has($key);
                $release = $releases->get($key);
                $official = $s['assessment'];
                $available = $this->officialValid($s);
                $authorized = $publications->has($s['window']->id.'|'.$s['to_week']);
                $ended = $s['ends_on'] < today()->toDateString();
                // New week publication is standing authorization for current official marks.
                // Existing snapshots retain their original rules until staff publish the range.
                $ready = $available && $ended && ($authorized || $this->snapshotMatches($s, $release));
                $status = ! $available ? 'not_evaluated' : (! $ended ? 'awaiting_week_end' : (! $ready ? 'awaiting_release' : ($done ? 'visible' : 'feedback_required')));
                $period = $s['rotation']->clinicalPeriod;

                return [
                    'key' => $s['key'], 'rotation_id' => $s['rotation']->id, 'academic_year' => $s['rotation']->academicYear?->code,
                    'clinical_period_id' => $s['rotation']->clinical_period_id,
                    'period_key' => $s['rotation']->academic_year_id.'|'.($s['rotation']->clinical_period_id ?: 'unlinked'),
                    'course_id' => $s['rotation']->course_id, 'course_ar' => $s['rotation']->course->name_ar, 'course_en' => $s['rotation']->course->name_en,
                    'period_ar' => $period?->name_ar ?: __('clinical_feedback.unassigned_period', [], 'ar'),
                    'period_en' => $period?->name_en ?: __('clinical_feedback.unassigned_period', [], 'en'),
                    'kind' => $s['kind'], 'from_week' => $s['from_week'], 'to_week' => $s['to_week'], 'starts_on' => $s['starts_on'], 'ends_on' => $s['ends_on'],
                    'supervisor_ar' => $s['supervisor']?->full_name_ar, 'supervisor_en' => $s['supervisor']?->full_name_en,
                    'feedback_done' => $done, 'can_participate' => $ready && ! $done, 'mark_ready' => (bool) $ready,
                    'assessment_available' => (bool) $available, 'status' => $status,
                ] + ($done && $ready ? ['mark' => ['score' => (float) $official->score, 'max_score' => (float) $official->max_score, 'revision' => $release?->revision ?? 1]] : []);
            })->values()->all();
    }

    public function participate(Student $student, string $key, int $experience, int $supervision, ?string $comment): void
    {
        DB::transaction(function () use ($student, $key, $experience, $supervision, $comment) {
            // Locks serialize concurrent retries without attaching the anonymous answer to this row.
            Student::whereKey($student->id)->lockForUpdate()->firstOrFail();
            $slot = $this->catalog($student)->firstWhere('key', $key);
            abort_unless($slot && $slot['supervisor_id'] && $slot['ends_on'] < today()->toDateString(), 404);
            $scope = ['window_id' => $slot['window']->id, 'student_id' => $student->id, 'slot_key' => $slot['slot_key']];
            if (DB::table('clinical_feedback_participations')->where($scope)->exists()) {
                return;
            }
            $this->assertSlotReady($slot, $student->id);
            // No student/mark/participation/token/IP/device/timestamp is stored with answers.
            DB::table('clinical_feedback_answers')->insert([
                'id' => Str::uuid()->toString(), 'window_id' => $slot['window']->id, 'supervisor_id' => $slot['supervisor_id'],
                'slot_key' => $slot['slot_key'], 'from_week' => $slot['from_week'], 'to_week' => $slot['to_week'],
                'experience' => $experience ?: null, 'supervision' => $supervision ?: null,
                'private_comment' => filled($comment) ? Crypt::encryptString(trim($comment)) : null,
            ]);
            DB::table('clinical_feedback_participations')->insert($scope + ['completed_on' => today()->toDateString()]);
        }, 3);
    }

    public function readySlot(Student $student, string $key): array
    {
        $slot = $this->catalog($student)->firstWhere('key', $key);
        abort_unless($slot && $slot['supervisor_id'] && $slot['ends_on'] < today()->toDateString(), 404);
        $this->assertSlotReady($slot, $student->id);

        return $slot;
    }

    private function assertSlotReady(array $slot, int $studentId): void
    {
        $release = ClinicalMarkRelease::where(['window_id' => $slot['window']->id, 'student_id' => $studentId, 'slot_key' => $slot['slot_key']])->first();
        $authorized = DB::table('clinical_week_publications')->where('window_id', $slot['window']->id)->where('week', $slot['to_week'])->exists();
        abort_unless($this->officialValid($slot) && ($authorized || $this->snapshotMatches($slot, $release)), 404);
    }

    public function publishMarks(ClinicalFeedbackWindow $window, User $actor, int $from, int $to): int
    {
        return DB::transaction(function () use ($window, $actor, $from, $to) {
            $window = ClinicalFeedbackWindow::whereKey($window->id)->lockForUpdate()->firstOrFail();
            if (! $window->is_enabled) {
                throw ValidationException::withMessages(['window' => [__('clinical_feedback.enable_before_publish')]]);
            }
            $window->load('rotation');
            $weekCount = min(60, max(1, (int) $window->rotation->duration_weeks));
            if ($to > $weekCount) {
                throw ValidationException::withMessages(['to_week' => [__('clinical_feedback.invalid_week_range')]]);
            }
            if ($to < max($from, (int) $window->from_week)) {
                throw ValidationException::withMessages(['to_week' => [__('clinical_feedback.invalid_week_range')]]);
            }
            $decisions = collect(range(max($from, (int) $window->from_week), $to))
                ->map(fn ($week) => ['window_id' => $window->id, 'week' => $week, 'published_by' => $actor->id, 'published_at' => now()])->all();
            if ($decisions) {
                DB::table('clinical_week_publications')->upsert($decisions, ['window_id', 'week'], ['published_by', 'published_at']);
            }
            $ids = StudentClinicalAssignment::whereHas('distributionVersion', fn ($q) => $q->where('rotation_id', $window->rotation_id)->where('is_current', true)->where('status', 'published'))
                ->whereHas('student', fn ($q) => $q->where('registration_status', 'active')->where('academic_registration_status', 'registered'))->distinct()->pluck('student_id');
            $allAssignments = StudentClinicalAssignment::whereIn('student_id', $ids)->whereHas('distributionVersion', fn ($q) => $q->where('rotation_id', $window->rotation_id)->where('is_current', true)->where('status', 'published'))
                ->with(['rotationBlock.rotation', 'distributionVersion.breaks', 'supervisor'])->get();
            $continuity = app(ClinicalAssessmentContinuity::class);
            $allOfficial = $continuity->distinctOfficial($continuity->forAssignments($allAssignments)->whereIn('status', ['submitted', 'approved'])->whereNotNull('score')->where('max_score', '>', 0)->with('clinicalAssignment.rotationBlock')->get());
            $window->load(['rotation.course.assessmentComponents', 'rotation.clinicalPeriod', 'rotation.academicYear']);
            $allWindows = collect([$window->rotation_id => $window]);
            $existing = ClinicalMarkRelease::where('window_id', $window->id)->get()->keyBy(fn ($r) => $r->student_id.'|'.$r->slot_key);
            $rows = [];
            $count = 0;
            foreach (Student::whereIn('id', $ids)->get() as $student) {
                foreach ($this->catalog($student, $allAssignments->where('student_id', $student->id), $allWindows, $allOfficial->where('student_id', $student->id))->filter(fn ($s) => (int) $s['window']->id === (int) $window->id && $s['to_week'] >= $from && $s['to_week'] <= $to) as $slot) {
                    $a = $slot['assessment'];
                    if (! $a || ! $slot['supervisor_id'] || $slot['ends_on'] >= today()->toDateString() || (float) $a->score < 0 || (float) $a->score > (float) $a->max_score) {
                        continue;
                    }
                    $release = $existing->get($student->id.'|'.$slot['slot_key']) ?: new ClinicalMarkRelease(['window_id' => $window->id, 'student_id' => $student->id, 'slot_key' => $slot['slot_key']]);
                    if ($release->exists && (int) $release->assessment_id === (int) $a->id && (float) $release->score === (float) $a->score && (float) $release->max_score === (float) $a->max_score && (int) $release->supervisor_id === (int) $slot['supervisor_id']) {
                        continue;
                    }
                    $release->fill(collect($slot)->only(['kind', 'from_week', 'to_week', 'starts_on', 'ends_on', 'supervisor_id'])->all() + [
                        'public_id' => $release->public_id ?: Str::uuid()->toString(), 'assessment_id' => $a->id, 'score' => $a->score, 'max_score' => $a->max_score,
                        'revision' => $release->exists ? $release->revision + 1 : 1, 'released_at' => now(), 'released_by' => $actor->id,
                    ]);
                    $attributes = $release->getAttributes();
                    unset($attributes['id']);
                    $rows[] = $attributes;
                    $count++;
                }
            }
            foreach (array_chunk($rows, 500) as $chunk) {
                ClinicalMarkRelease::upsert($chunk, ['window_id', 'student_id', 'slot_key'], ['assessment_id', 'kind', 'from_week', 'to_week', 'starts_on', 'ends_on', 'supervisor_id', 'score', 'max_score', 'revision', 'released_at', 'released_by']);
            }
            $this->audit($actor, 'clinical_feedback.marks_published', $window->id, ['from_week' => $from, 'to_week' => $to, 'count' => $count]);

            return $count;
        }, 3);
    }

    public function assertRotationDeletable(int $rotationId): void
    {
        if (! Schema::hasTable('clinical_feedback_windows')) {
            return;
        }
        $window = ClinicalFeedbackWindow::where('rotation_id', $rotationId)->value('id');
        if (! $window) {
            return;
        }
        foreach (['clinical_mark_releases', 'clinical_feedback_participations', 'clinical_feedback_answers', 'clinical_feedback_batches', 'clinical_week_publications'] as $table) {
            if (DB::table($table)->where('window_id', $window)->exists()) {
                throw ValidationException::withMessages(['rotation' => [__('clinical_feedback.schedule_history')]]);
            }
        }
    }

    public function audit(User $actor, string $action, int $window, array $changes = []): void
    {
        AuditLog::create(['user_id' => $actor->id, 'action' => $action, 'entity_type' => 'clinical_feedback_window', 'entity_id' => $window, 'changes' => $changes]);
    }
}
